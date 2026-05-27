#!/usr/bin/env node

import { execFileSync } from 'node:child_process';
import { mkdir, readFile, rm, writeFile } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { XMLParser } from 'fast-xml-parser';
import { globby } from 'globby';
import Graph from 'graphology';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../..');
const BENCHMARKS_DIR = path.join(ROOT, 'benchmarks');
const OUTPUT_ROOT = path.join(ROOT, 'analysis/graphs');

const BENCHMARKS = {
  'jpetstore-6': {
    path: 'benchmarks/jpetstore-6',
    framework: 'stripes-spring-mybatis',
    javaGlob: 'benchmarks/jpetstore-6/src/main/java/**/*.java',
    resourceGlob: 'benchmarks/jpetstore-6/src/main/{resources,webapp}/**/*.{xml,properties,sql}',
  },
  acmeair: {
    path: 'benchmarks/acmeair',
    framework: 'jax-rs-gradle',
    javaGlob: 'benchmarks/acmeair/**/src/main/java/**/*.java',
    resourceGlob: 'benchmarks/acmeair/**/src/main/{resources,webapp}/**/*.{xml,properties,yml,yaml}',
  },
  'sample.plantsbywebsphere': {
    path: 'benchmarks/sample.plantsbywebsphere',
    framework: 'jsf-cdi-servlet-ejb',
    javaGlob: 'benchmarks/sample.plantsbywebsphere/src/main/java/**/*.java',
    resourceGlob: 'benchmarks/sample.plantsbywebsphere/src/main/{resources,webapp}/**/*.{xml,properties,yml,yaml}',
  },
  'sample.daytrader7': {
    path: 'benchmarks/sample.daytrader7',
    framework: 'java-ee-servlet-jsf-ejb',
    javaGlob: 'benchmarks/sample.daytrader7/**/src/main/java/**/*.java',
    resourceGlob: 'benchmarks/sample.daytrader7/**/src/main/{resources,webapp}/**/*.{xml,properties,yml,yaml,ddl,sql}',
  },
  cargotracker: {
    path: 'benchmarks/cargotracker',
    framework: 'jakarta-jaxrs-jsf-batch-jms',
    javaGlob: 'benchmarks/cargotracker/src/main/java/**/*.java',
    resourceGlob: 'benchmarks/cargotracker/src/main/{resources,webapp}/**/*.{xml,properties,yml,yaml}',
  },
};

const ACCESSOR_PREFIXES = ['get', 'set', 'is'];
const IGNORE_ACTION_METHODS = new Set(['clear']);
const JSF_ACTION_METHOD_NAMES = new Set(['submit']);
const JAVA_KEYWORDS = new Set([
  'if', 'for', 'while', 'switch', 'return', 'new', 'throw', 'catch', 'try', 'else', 'do', 'synchronized',
]);

if (process.argv[1] === fileURLToPath(import.meta.url)) {
  main().catch((error) => {
    console.error(error);
    process.exitCode = 1;
  });
}

async function main() {
  const requested = process.argv.slice(2);
  const names = requested.length ? requested : Object.keys(BENCHMARKS);
  const unknown = names.filter((name) => !BENCHMARKS[name]);
  if (unknown.length) {
    throw new Error(`Unknown benchmark(s): ${unknown.join(', ')}`);
  }

  const codeql = detectCodeql();
  const treeSitter = await detectTreeSitter();

  for (const name of names) {
    const benchmark = BENCHMARKS[name];
    const outDir = path.join(OUTPUT_ROOT, name);
    await mkdir(outDir, { recursive: true });

    const context = await loadBenchmark(name, benchmark, codeql, treeSitter);
    const outputs = extractBenchmark(context);

    await writeJson(path.join(outDir, 'action-points.json'), outputs.actionPoints);
    await writeJson(path.join(outDir, 'method-graph.json'), outputs.methodGraph);
    await writeJson(path.join(outDir, 'class-graph.json'), outputs.classGraph);
    await writeJson(path.join(outDir, 'data-sources.json'), outputs.dataSources);
    await writeChainOutputs(path.join(outDir, 'chains'), outputs.chains);
    await writeFile(path.join(outDir, 'extraction-report.md'), outputs.report, 'utf8');

    console.log(`${name}: ${outputs.actionPoints.length} action points, ${outputs.methodGraph.edges.length} method edges`);
  }
}

function detectCodeql() {
  try {
    const version = execFileSync('codeql', ['version'], { encoding: 'utf8' }).trim();
    return { available: true, version };
  } catch {
    return { available: false, reason: 'CodeQL CLI was not found on PATH. Current output uses static fallback edges.' };
  }
}

async function detectTreeSitter() {
  try {
    const ParserModule = await import('tree-sitter');
    const JavaModule = await import('tree-sitter-java');
    const Parser = ParserModule.default ?? ParserModule;
    const Java = JavaModule.default ?? JavaModule;
    const parser = new Parser();
    parser.setLanguage(Java);
    return { available: true, parser };
  } catch (error) {
    return { available: false, reason: `tree-sitter unavailable: ${error.message}` };
  }
}

async function loadBenchmark(name, benchmark, codeql, treeSitter) {
  const javaFiles = await globby(benchmark.javaGlob, { cwd: ROOT, absolute: true });
  const resourceFiles = await globby(benchmark.resourceGlob, { cwd: ROOT, absolute: true });
  const javaUnits = [];

  for (const filePath of javaFiles.sort()) {
    const text = await readFile(filePath, 'utf8');
    const unit = parseJavaUnit(filePath, text, treeSitter);
    javaUnits.push(unit);
  }

  const resourceUnits = [];
  for (const filePath of resourceFiles.sort()) {
    resourceUnits.push({ filePath, text: await readFile(filePath, 'utf8') });
  }

  const byClass = new Map(javaUnits.map((unit) => [unit.className, unit]));
  const byFqn = new Map(javaUnits.map((unit) => [unit.fqn, unit]));
  const xmlParser = new XMLParser({ ignoreAttributes: false, attributeNamePrefix: '@_' });

  return { name, benchmark, javaUnits, resourceUnits, byClass, byFqn, codeql, treeSitter, xmlParser };
}

function parseJavaUnit(filePath, text, treeSitter) {
  const packageName = matchOne(text, /package\s+([\w.]+)\s*;/) ?? '';
  const declaration = parseDeclaration(text, filePath);
  const className = declaration.name;
  const fqn = packageName ? `${packageName}.${className}` : className;
  const annotations = [...text.matchAll(/^\s*@([\w.]+)(?:\([^)]*\))?/gm)].map((m) => m[1].split('.').pop());
  const fields = parseFields(text);
  const methods = parseMethods(text, className);
  let treeSitterParsed = false;
  if (treeSitter.available) {
    try {
      treeSitter.parser.parse(text);
      treeSitterParsed = true;
    } catch {
      treeSitterParsed = false;
    }
  }

  return {
    filePath: rel(filePath),
    packageName,
    className,
    fqn,
    declarationKind: declaration.kind,
    extendsType: declaration.extendsType,
    implementsTypes: declaration.implementsTypes,
    annotations,
    fields,
    methods,
    treeSitterParsed,
    text,
  };
}

function parseFields(text) {
  const fields = new Map();
  const fieldPattern = /^\s*(?:@\w+(?:\([^)]*\))?\s*)*(?:(?:private|protected|public)\s+)?(?:static\s+)?(?:final\s+)?(?:transient\s+)?([\w.$<>?, ]+)\s+(\w+)\s*(?:[;=])/gm;
  for (const match of text.matchAll(fieldPattern)) {
    const lineStart = text.lastIndexOf('\n', match.index) + 1;
    const lineEnd = text.indexOf('\n', match.index);
    const line = text.slice(lineStart, lineEnd === -1 ? text.length : lineEnd).trim();
    if (/^(?:return|throw|if|for|while|switch)\b/.test(line)) continue;
    const fieldType = cleanType(match[1]);
    if (!fieldType) continue;
    fields.set(match[2], fieldType);
  }

  const ctorPattern = /public\s+\w+\s*\(([^)]*)\)\s*\{([\s\S]*?)^\s*\}/gm;
  for (const ctor of text.matchAll(ctorPattern)) {
    const params = parseParams(ctor[1]);
    for (const assign of ctor[2].matchAll(/this\.(\w+)\s*=\s*(\w+)\s*;/g)) {
      const paramType = params.get(assign[2]);
      if (paramType) fields.set(assign[1], paramType);
    }
  }

  return Object.fromEntries(fields);
}

function parseDeclaration(text, filePath) {
  const match = stripJavaComments(text).match(/\b(class|interface|enum)\s+(\w+)(?:\s+extends\s+([\w.$]+))?(?:\s+implements\s+([^{]+))?/);
  return {
    kind: match?.[1] ?? 'class',
    name: match?.[2] ?? path.basename(filePath, '.java'),
    extendsType: match?.[3] ? simpleType(match[3]) : null,
    implementsTypes: match?.[4]
      ? match[4].split(',').map((part) => simpleType(part.trim())).filter(Boolean)
      : [],
  };
}

function stripJavaComments(text) {
  return text
    .replace(/\/\*[\s\S]*?\*\//g, '')
    .replace(/\/\/.*$/gm, '');
}

function parseParams(paramsText) {
  const params = new Map();
  for (const raw of paramsText.split(',')) {
    const normalized = raw.trim().replace(/@\w+(?:\([^)]*\))?\s*/g, '');
    if (!normalized) continue;
    const pieces = normalized.split(/\s+/);
    if (pieces.length >= 2) {
      params.set(pieces.at(-1), cleanType(pieces.slice(0, -1).join(' ')));
    }
  }
  return params;
}

function parseMethods(text, className) {
  const methods = [];
  const constructorPattern = /(?:^|\n)(\s*(?:@\w+(?:\([^)]*\))?\s*)*)(?:(public|protected|private)\s+)?(?:\/\*.*?\*\/\s*)?\bCONSTRUCTOR_NAME\s*\(([^{};]*?)\)\s*(?:throws\s+[\w.,\s]+?)?\s*\{/g;
  const actualConstructorPattern = new RegExp(constructorPattern.source.replace('CONSTRUCTOR_NAME', escapeRegex(className)), 'g');
  let constructorMatch;
  while ((constructorMatch = actualConstructorPattern.exec(text))) {
    const openBrace = actualConstructorPattern.lastIndex - 1;
    const closeBrace = findMatchingBrace(text, openBrace);
    if (closeBrace < 0) continue;
    const annotations = [...constructorMatch[1].matchAll(/@(\w+)/g)].map((m) => m[1]);
    methods.push({
      name: '<init>',
      visibility: constructorMatch[2] ?? 'package',
      returnType: '',
      params: [...parseParams(constructorMatch[3])].map(([name, type]) => ({ name, type })),
      annotations,
      line: lineOf(text, constructorMatch.index),
      body: text.slice(openBrace + 1, closeBrace),
      constructor: true,
    });
    actualConstructorPattern.lastIndex = closeBrace + 1;
  }

  const methodPattern = /(?:^|\n)(\s*(?:@\w+(?:\([^)]*\))?\s*)*)(?:(public|protected|private)\s+)?(?:\/\*.*?\*\/\s*)?([\w.$<>\[\], ?]+)\s+(\w+)\s*\(([^{};]*?)\)\s*(?:throws\s+[\w.,\s]+?)?\s*\{/g;
  let match;
  while ((match = methodPattern.exec(text))) {
    const openBrace = methodPattern.lastIndex - 1;
    const closeBrace = findMatchingBrace(text, openBrace);
    if (closeBrace < 0) continue;
    const annotations = [...match[1].matchAll(/@(\w+)/g)].map((m) => m[1]);
    const body = text.slice(openBrace + 1, closeBrace);
    methods.push({
      name: match[4],
      visibility: match[2] ?? 'package',
      returnType: cleanType(match[3]),
      params: [...parseParams(match[5])].map(([name, type]) => ({ name, type })),
      annotations,
      line: lineOf(text, match.index),
      body,
    });
    methodPattern.lastIndex = closeBrace + 1;
  }
  const known = new Set(methods.map((method) => method.name));
  const declarationPattern = /(?:^|\n)(\s*(?:@\w+(?:\([^)]*\))?\s*)*)(public|protected|private)\s+(?:abstract\s+)?(?:\/\*.*?\*\/\s*)?([\w.$<>\[\], ?]+)\s+(\w+)\s*\(([^{};]*?)\)\s*;/g;
  while ((match = declarationPattern.exec(text))) {
    if (known.has(match[4])) continue;
    const annotations = [...match[1].matchAll(/@(\w+)/g)].map((m) => m[1]);
    methods.push({
      name: match[4],
      visibility: match[2] ?? 'public',
      returnType: cleanType(match[3]),
      params: [...parseParams(match[5])].map(([name, type]) => ({ name, type })),
      annotations,
      line: lineOf(text, match.index),
      body: '',
      declarationOnly: true,
    });
    known.add(match[4]);
  }
  return methods;
}

function extractBenchmark(context) {
  const graph = new Graph({ multi: true, type: 'directed' });
  const dataSources = extractDataSources(context);
  const actionPoints = context.name === 'jpetstore-6'
    ? extractJpetstoreActionPoints(context)
    : extractGenericActionPoints(context);
  const methodEdges = extractFallbackMethodEdges(context, dataSources);

  for (const edge of methodEdges) {
    graph.mergeNode(edge.from, edge.fromNode ?? {});
    graph.mergeNode(edge.to, edge.toNode ?? {});
    graph.addDirectedEdgeWithKey(edge.id, edge.from, edge.to, edge);
  }

  const methodGraph = {
    benchmark: context.name,
    generatedBy: 'tools/graph-extractor/extract.mjs',
    codeql: context.codeql,
    treeSitter: summarizeTreeSitter(context),
    nodes: graph.nodes().map((id) => ({ id, ...graph.getNodeAttributes(id) })),
    edges: graph.edges().map((id) => ({ id, ...graph.getEdgeAttributes(id) })),
  };

  const classGraph = buildClassGraph(methodGraph);
  const chains = buildChains(context, actionPoints, methodGraph, dataSources);
  const report = buildReport(context, actionPoints, methodGraph, classGraph, dataSources, chains);

  return { actionPoints, methodGraph, classGraph, dataSources, chains, report };
}

function extractJpetstoreActionPoints(context) {
  const actionPoints = [];
  for (const unit of context.javaUnits.filter((unit) => unit.className.endsWith('ActionBean'))) {
    if (unit.className === 'AbstractActionBean') continue;
    for (const method of unit.methods) {
      if (method.visibility !== 'public') continue;
      if (IGNORE_ACTION_METHODS.has(method.name)) continue;
      if (ACCESSOR_PREFIXES.some((prefix) => method.name.startsWith(prefix))) continue;
      if (!/Resolution$/.test(method.returnType)) continue;
      actionPoints.push({
        id: `action:${unit.fqn}#${method.name}`,
        benchmark: context.name,
        framework: 'Stripes',
        kind: 'action_point',
        className: unit.className,
        classFqn: unit.fqn,
        methodName: method.name,
        methodId: methodId(unit.fqn, method.name),
        file: unit.filePath,
        line: method.line,
        annotations: method.annotations,
        routeHint: `/actions/${unit.className.replace(/ActionBean$/, '')}.action?${method.name}`,
        detectionSource: 'tree-sitter/regex-static',
      });
    }
  }
  return actionPoints;
}

function extractGenericActionPoints(context) {
  const actionPoints = [];
  for (const unit of context.javaUnits) {
    const isRest = unit.annotations.some((a) => ['Path', 'ApplicationPath'].includes(a)) || /@Path\s*\(/.test(unit.text);
    const isServlet = /@WebServlet\s*\(|extends\s+HttpServlet/.test(unit.text);
    const isScheduled = /@Schedule\s*\(|@Scheduled\s*\(/.test(unit.text);
    const isMessageDriven = /@MessageDriven\s*\(/.test(unit.text);
    const isNamed = /@Named(?:\s|\()/.test(unit.text);
    if (!isRest && !isServlet && !isScheduled && !isMessageDriven && !isNamed) continue;

    for (const method of unit.methods.filter((m) => m.visibility === 'public')) {
      const methodAnnotations = new Set(method.annotations);
      const isRestMethod = isRest && ['GET', 'POST', 'PUT', 'DELETE', 'PATCH'].some((a) => methodAnnotations.has(a));
      const entryMethod = /^(doGet|doPost|service|onMessage)$/.test(method.name)
        || isRestMethod
        || ['Schedule', 'Scheduled'].some((a) => methodAnnotations.has(a))
        || (isNamed && isLikelyJsfActionMethod(method));
      if (!entryMethod) continue;
      actionPoints.push({
        id: `action:${unit.fqn}#${method.name}`,
        benchmark: context.name,
        framework: context.benchmark.framework,
        kind: 'action_point',
        className: unit.className,
        classFqn: unit.fqn,
        methodName: method.name,
        methodId: methodId(unit.fqn, method.name),
        file: unit.filePath,
        line: method.line,
        annotations: method.annotations,
        detectionSource: 'generic-static',
      });
    }
  }
  return actionPoints;
}

function isLikelyJsfActionMethod(method) {
  if (method.declarationOnly) return false;
  if (ACCESSOR_PREFIXES.some((prefix) => method.name.startsWith(prefix))) return false;
  if (IGNORE_ACTION_METHODS.has(method.name)) return false;
  return method.returnType === 'String' || method.name.startsWith('perform') || JSF_ACTION_METHOD_NAMES.has(method.name);
}

function extractFallbackMethodEdges(context, dataSources) {
  const edges = [];
  const implementationsByType = buildImplementationsByType(context);
  const externalDataSourceByType = buildExternalDataSourceByType(dataSources);
  const messageConsumersByDestination = buildMessageConsumersByDestination(context);
  const entityTableByClass = new Map(dataSources.entities.map((entity) => [entity.className, entity.tableId]));
  const tableByNamedQuery = new Map((dataSources.namedQueries ?? []).map((query) => [query.name, query.tableId]));
  const mapperStatementByMethod = new Map();
  for (const mapper of dataSources.mappers) {
    for (const statement of mapper.statements) {
      mapperStatementByMethod.set(`${mapper.interfaceName}.${statement.id}`, statement);
    }
  }

  for (const unit of context.javaUnits) {
    for (const method of unit.methods) {
      const from = methodId(unit.fqn, method.name);
      const calls = extractCalls(method.body);
      for (const call of calls) {
        const localTypes = parseLocalTypes(method);
        const fieldType = call.receiver === 'this'
          ? unit.className
          : unit.fields[call.receiver] ?? localTypes.get(call.receiver);
        const targetUnit = fieldType ? context.byClass.get(simpleType(fieldType)) : null;
        if (targetUnit) {
          const target = methodId(targetUnit.fqn, call.method);
          edges.push({
            id: edgeId('call', from, target, edges.length),
            type: 'call',
            source: 'static-fallback',
            from,
            to: target,
            fromNode: methodNode(unit, method),
            toNode: { id: target, kind: 'method', className: targetUnit.className, classFqn: targetUnit.fqn, methodName: call.method },
            callSite: call.raw,
          });
          for (const implUnit of implementationsByType.get(targetUnit.className) ?? []) {
            if (!implUnit.methods.some((candidate) => candidate.name === call.method)) continue;
            const implTarget = methodId(implUnit.fqn, call.method);
            edges.push({
              id: edgeId('polymorphic_call', target, implTarget, edges.length),
              type: 'polymorphic_call',
              source: 'static-implementation-bridge',
              from: target,
              to: implTarget,
              fromNode: { id: target, kind: 'method', className: targetUnit.className, classFqn: targetUnit.fqn, methodName: call.method },
              toNode: { id: implTarget, kind: 'method', className: implUnit.className, classFqn: implUnit.fqn, methodName: call.method, file: implUnit.filePath },
              callSite: call.raw,
            });
          }
        } else if (fieldType) {
          const target = `unresolved:${fieldType}#${call.method}`;
          edges.push({
            id: edgeId('call', from, target, edges.length),
            type: 'call',
            source: 'static-fallback',
            unresolved: true,
            from,
            to: target,
            fromNode: methodNode(unit, method),
            toNode: { id: target, kind: 'unknown_framework_target', className: simpleType(fieldType), methodName: call.method },
            callSite: call.raw,
          });
        }

        const statement = fieldType ? mapperStatementByMethod.get(`${simpleType(fieldType)}.${call.method}`) : null;
        if (statement) {
          const mapperMethod = targetUnit ? methodId(targetUnit.fqn, call.method) : `unresolved:${fieldType}#${call.method}`;
          for (const table of statement.tables) {
            const tableNode = `table:${table}`;
            edges.push({
              id: edgeId('data_access', mapperMethod, tableNode, edges.length),
              type: 'data_access',
              source: 'mybatis-xml',
              operation: statement.operation,
              from: mapperMethod,
              to: tableNode,
              fromNode: { id: mapperMethod, kind: 'method', className: simpleType(fieldType), methodName: call.method },
              toNode: { id: tableNode, kind: 'table', name: table },
            });
          }
        }

        const externalDataSource = fieldType ? externalDataSourceByType.get(simpleType(fieldType)) : null;
        if (externalDataSource) {
          edges.push({
            id: edgeId('data_access', from, externalDataSource.id, edges.length),
            type: 'data_access',
            source: 'static-external-resource-field',
            operation: call.method,
            from,
            to: externalDataSource.id,
            fromNode: methodNode(unit, method),
            toNode: externalDataSource,
            callSite: call.raw,
          });
        }
      }

      for (const call of extractConstructorCalls(method.body)) {
        const targetUnit = context.byClass.get(call.className);
        if (!targetUnit) continue;
        const target = methodId(targetUnit.fqn, '<init>');
        edges.push({
          id: edgeId('call', from, target, edges.length),
          type: 'call',
          source: 'static-constructor-call',
          from,
          to: target,
          fromNode: methodNode(unit, method),
          toNode: { id: target, kind: 'method', className: targetUnit.className, classFqn: targetUnit.fqn, methodName: '<init>', file: targetUnit.filePath },
          callSite: call.raw,
        });
      }

      edges.push(...extractJpaDataAccessEdges(unit, method, from, edges.length, entityTableByClass, tableByNamedQuery));
      edges.push(...extractJdbcDataAccessEdges(unit, method, from, edges.length, dataSources));
      edges.push(...extractMessageTriggerEdges(unit, method, from, edges.length, messageConsumersByDestination));

      for (const call of extractSameClassCalls(method.body, unit, method)) {
        const target = methodId(unit.fqn, call.method);
        edges.push({
          id: edgeId('call', from, target, edges.length),
          type: 'call',
          source: 'static-fallback',
          from,
          to: target,
          fromNode: methodNode(unit, method),
          toNode: { id: target, kind: 'method', className: unit.className, classFqn: unit.fqn, methodName: call.method, file: unit.filePath },
          callSite: call.raw,
        });
        for (const implUnit of implementationsByType.get(unit.className) ?? []) {
          if (!implUnit.methods.some((candidate) => candidate.name === call.method)) continue;
          const implTarget = methodId(implUnit.fqn, call.method);
          edges.push({
            id: edgeId('polymorphic_call', target, implTarget, edges.length),
            type: 'polymorphic_call',
            source: 'static-implementation-bridge',
            from: target,
            to: implTarget,
            fromNode: { id: target, kind: 'method', className: unit.className, classFqn: unit.fqn, methodName: call.method, file: unit.filePath },
            toNode: { id: implTarget, kind: 'method', className: implUnit.className, classFqn: implUnit.fqn, methodName: call.method, file: implUnit.filePath },
            callSite: call.raw,
          });
        }
      }
    }
  }

  for (const entity of dataSources.entities) {
    edges.push({
      id: edgeId('entity_table', entity.id, entity.tableId, edges.length),
      type: 'entity_table',
      source: 'jpa-annotation',
      from: entity.id,
      to: entity.tableId,
      fromNode: {
        id: entity.id,
        kind: 'entity',
        className: entity.className,
        classFqn: entity.classFqn,
      },
      toNode: {
        id: entity.tableId,
        kind: 'table',
        name: entity.table,
      },
    });
  }

  return dedupeEdges(edges);
}

function extractJpaDataAccessEdges(unit, method, from, startIndex, entityTableByClass, tableByNamedQuery) {
  const edges = [];
  const localTypes = parseLocalTypes(method);
  const entityManagers = new Set(
    Object.entries(unit.fields)
      .filter(([, type]) => simpleType(type) === 'EntityManager')
      .map(([name]) => name),
  );
  if (!entityManagers.size) return edges;

  for (const receiver of entityManagers) {
    for (const match of method.body.matchAll(new RegExp(`\\b${receiver}\\s*\\.\\s*find\\s*\\(\\s*(\\w+)\\.class`, 'g'))) {
      const tableId = entityTableByClass.get(match[1]);
      if (tableId) edges.push(jpaDataAccessEdge(from, tableId, unit, method, 'find', edges.length + startIndex));
    }
    for (const match of method.body.matchAll(new RegExp(`\\b${receiver}\\s*\\.\\s*(?:persist|merge|remove)\\s*\\(\\s*(\\w+)`, 'g'))) {
      const variableType = localTypes.get(match[1]) ?? match[1];
      const tableId = entityTableByClass.get(simpleType(variableType));
      if (tableId) edges.push(jpaDataAccessEdge(from, tableId, unit, method, match[1], edges.length + startIndex));
    }
    for (const match of method.body.matchAll(new RegExp(`\\b${receiver}\\s*\\.\\s*createNamedQuery\\s*\\(\\s*"([^"]+)"`, 'g'))) {
      const tableId = tableByNamedQuery.get(match[1]);
      if (tableId) edges.push(jpaDataAccessEdge(from, tableId, unit, method, `namedQuery:${match[1]}`, edges.length + startIndex));
    }
  }
  return edges;
}

function jpaDataAccessEdge(from, tableId, unit, method, operation, index) {
  return {
    id: edgeId('data_access', from, tableId, index),
    type: 'data_access',
    source: 'jpa-static',
    operation,
    from,
    to: tableId,
    fromNode: methodNode(unit, method),
    toNode: { id: tableId, kind: 'table', name: tableId.replace(/^table:/, '') },
  };
}

function extractJdbcDataAccessEdges(unit, method, from, startIndex, dataSources) {
  const tableIds = new Set();
  const sqlConstants = extractSqlConstants(unit.text);

  for (const sqlText of extractJavaStringTexts(method.body)) {
    for (const table of extractSqlTables(sqlText)) tableIds.add(`table:${table}`);
  }

  for (const match of method.body.matchAll(/\b(?:getStatement|prepareStatement)\s*\(\s*(?:\w+\s*,\s*)?(\w+)/g)) {
    const sqlText = sqlConstants.get(match[1]);
    if (!sqlText) continue;
    for (const table of extractSqlTables(sqlText)) tableIds.add(`table:${table}`);
  }

  if (method.name === 'recreateDBTables' && /\bexecuteUpdate\s*\(\s*\(?\s*String\s*\)?\s*sqlBuffer\s*\[/.test(method.body)) {
    for (const table of dataSources.tables) tableIds.add(table.id);
  }

  return [...tableIds]
    .filter((tableId) => dataSources.tables.some((table) => table.id === tableId))
    .sort()
    .map((tableId, index) => ({
      id: edgeId('data_access', from, tableId, startIndex + index),
      type: 'data_access',
      source: 'jdbc-static-sql',
      operation: 'sql',
      from,
      to: tableId,
      fromNode: methodNode(unit, method),
      toNode: { id: tableId, kind: 'table', name: tableId.replace(/^table:/, '') },
    }));
}

function extractSqlConstants(text) {
  const constants = new Map();
  const assignmentPattern = /\bString\s+(\w+)\s*=\s*([\s\S]*?);/g;
  for (const match of text.matchAll(assignmentPattern)) {
    const sqlText = extractJavaStringTexts(match[2]).join(' ');
    if (extractSqlTables(sqlText).length) constants.set(match[1], sqlText);
  }
  return constants;
}

function extractJavaStringTexts(text) {
  return [...text.matchAll(/"((?:\\.|[^"\\])*)"/g)]
    .map((match) => match[1].replace(/\\"/g, '"'))
    .filter(Boolean);
}

function buildImplementationsByType(context) {
  const implementationsByType = new Map();
  for (const unit of context.javaUnits) {
    for (const type of implementedTypesForUnit(unit, context).filter(Boolean)) {
      if (!implementationsByType.has(type)) implementationsByType.set(type, []);
      implementationsByType.get(type).push(unit);
    }
  }
  return implementationsByType;
}

function implementedTypesForUnit(unit, context) {
  const result = new Set();
  const queue = [unit.extendsType, ...unit.implementsTypes].filter(Boolean);
  while (queue.length) {
    const type = queue.shift();
    if (!type || result.has(type)) continue;
    result.add(type);
    const typeUnit = context.byClass.get(simpleType(type));
    if (typeUnit) queue.push(typeUnit.extendsType, ...typeUnit.implementsTypes);
  }
  return [...result];
}

function buildExternalDataSourceByType(dataSources) {
  const byType = new Map();
  for (const external of dataSources.externalEndpoints) {
    for (const type of external.staticTypes) byType.set(type, external);
  }
  return byType;
}

function buildMessageConsumersByDestination(context) {
  const consumersByDestination = new Map();
  for (const unit of context.javaUnits) {
    if (!/@MessageDriven\s*\(/.test(unit.text)) continue;
    const destination = matchOne(unit.text, /propertyName\s*=\s*"destinationLookup"[\s\S]*?propertyValue\s*=\s*"([^"]+)"/);
    const onMessage = unit.methods.find((method) => method.name === 'onMessage');
    if (!destination || !onMessage) continue;
    if (!consumersByDestination.has(destination)) consumersByDestination.set(destination, []);
    consumersByDestination.get(destination).push({ unit, method: onMessage });
  }
  return consumersByDestination;
}

function extractMessageTriggerEdges(unit, method, from, startIndex, consumersByDestination) {
  const edges = [];
  const destinationsByField = extractResourceDestinations(unit.text);
  if (!destinationsByField.size) return edges;

  for (const match of method.body.matchAll(/\.send\s*\(\s*(\w+)\s*,/g)) {
    const destination = destinationsByField.get(match[1]);
    if (!destination) continue;
    for (const consumer of consumersByDestination.get(destination) ?? []) {
      const to = methodId(consumer.unit.fqn, consumer.method.name);
      edges.push({
        id: edgeId('message_trigger', from, to, edges.length + startIndex),
        type: 'message_trigger',
        source: 'static-jms-destination-bridge',
        destination,
        from,
        to,
        fromNode: methodNode(unit, method),
        toNode: methodNode(consumer.unit, consumer.method),
        callSite: match[0],
      });
    }
  }
  return edges;
}

function extractResourceDestinations(text) {
  const destinationsByField = new Map();
  const resourcePattern = /@Resource\s*\([^)]*lookup\s*=\s*"([^"]+)"[^)]*\)\s*(?:private|protected|public)?\s*[\w.$<>?, ]+\s+(\w+)\s*;/g;
  for (const match of text.matchAll(resourcePattern)) {
    destinationsByField.set(match[2], match[1]);
  }
  return destinationsByField;
}

function extractCalls(body) {
  const calls = [];
  // Use open-paren-only pattern so that calls nested inside another call's
  // argument list (e.g. outer(inner(x))) are not consumed by the outer match.
  const callPattern = /\b(\w+)\s*\.\s*(\w+)\s*\(/g;
  for (const match of body.matchAll(callPattern)) {
    if (JAVA_KEYWORDS.has(match[1])) continue;
    calls.push({ receiver: match[1], method: match[2], args: '', raw: match[0] });
  }
  return calls;
}

function extractConstructorCalls(body) {
  const calls = [];
  const constructorPattern = /\bnew\s+([A-Z]\w*)\s*\(/g;
  for (const match of body.matchAll(constructorPattern)) {
    calls.push({ className: match[1], raw: match[0] });
  }
  return calls;
}

function extractSameClassCalls(body, unit, currentMethod) {
  const ownMethods = new Set(unit.methods.map((method) => method.name));
  const calls = [];
  const callPattern = /(?:^|[^\w.])(\w+)\s*\(/g;
  for (const match of body.matchAll(callPattern)) {
    const method = match[1];
    if (method === currentMethod.name) continue;
    if (!ownMethods.has(method)) continue;
    if (JAVA_KEYWORDS.has(method)) continue;
    calls.push({ method, raw: `${method}(` });
  }
  return calls;
}

function parseLocalTypes(method) {
  const types = new Map(method.params.map((param) => [param.name, param.type]));
  const declarationPattern = /\b([A-Z]\w*(?:<[^;=()]+>)?)\s+(\w+)\s*(?:=|;)/g;
  for (const match of method.body.matchAll(declarationPattern)) {
    types.set(match[2], cleanType(match[1]));
  }
  return types;
}

function extractDataSources(context) {
  const tables = new Set();
  const entities = [];
  const externalEndpoints = [];
  const mappers = [];
  const namedQueries = [];
  const xmlFiles = context.resourceUnits.filter((unit) => unit.filePath.endsWith('.xml'));

  for (const resource of context.resourceUnits) {
    for (const match of resource.text.matchAll(/\bcreate\s+table\s+([`"\[]?)([\w.]+)\1/gi)) {
      tables.add(match[2].toLowerCase());
    }
  }

  for (const xml of xmlFiles.filter((unit) => /<mapper\b/.test(unit.text))) {
    const parsed = safeParseXml(context.xmlParser, xml.text);
    const mapperNode = parsed?.mapper;
    const namespace = mapperNode?.['@_namespace'] ?? matchOne(xml.text, /<mapper[^>]+namespace="([^"]+)"/);
    if (!namespace) continue;
    const statements = [];
    for (const operation of ['select', 'insert', 'update', 'delete']) {
      const rawStatements = asArray(mapperNode?.[operation]);
      for (const statement of rawStatements) {
        const id = statement?.['@_id'];
        const sqlText = typeof statement === 'string' ? statement : collectText(statement);
        const statementTables = extractSqlTables(sqlText);
        for (const table of statementTables) tables.add(table);
        statements.push({ id, operation, tables: statementTables, file: rel(xml.filePath) });
      }
    }
    mappers.push({
      namespace,
      interfaceName: namespace.split('.').pop(),
      file: rel(xml.filePath),
      statements: statements.filter((statement) => statement.id),
    });
  }

  for (const unit of context.javaUnits) {
    if (!/@(?:Entity|jakarta\.persistence\.Entity|javax\.persistence\.Entity)\b/.test(unit.text)) continue;
    const entityName = matchOne(unit.text, /@Entity\s*\([^)]*name\s*=\s*"([^"]+)"/s) ?? unit.className;
    const table = (
      matchOne(unit.text, /@Table\s*\([^)]*name\s*=\s*"([^"]+)"/s)
      ?? matchOne(unit.text, /@Table\s*\([^)]*name\s*=\s*'([^']+)'/s)
      ?? unit.className
    ).toLowerCase();
    tables.add(table);
    const unitNamedQueries = [...unit.text.matchAll(/@Named(?:Native)?Query\s*\([^)]*name\s*=\s*"([^"]+)"[^)]*query\s*=\s*"([^"]+)"/gs)]
      .map((match) => {
        const queryEntities = extractJpqlEntities(match[2]);
        return {
          name: match[1],
          query: match[2],
          entities: queryEntities,
          tableId: queryEntities.some((queryEntity) => [entityName, unit.className].includes(queryEntity))
            ? `table:${table}`
            : (queryEntities[0] ? `table:${queryEntities[0].toLowerCase()}` : `table:${table}`),
        };
      });
    namedQueries.push(...unitNamedQueries);
    entities.push({
      id: `entity:${unit.fqn}`,
      kind: 'entity',
      className: unit.className,
      classFqn: unit.fqn,
      file: unit.filePath,
      table,
      tableId: `table:${table}`,
      entityName,
      namedQueries: unitNamedQueries.map((query) => query.name),
    });
  }

  if (context.javaUnits.some((unit) => /\b(?:MongoClient|Morphia|Datastore)\b/.test(unit.text))) {
    externalEndpoints.push({
      id: 'external_endpoint:mongodb',
      kind: 'external_endpoint',
      name: 'MongoDB',
      technology: 'mongodb',
      staticTypes: ['Datastore', 'MongoClient', 'Morphia'],
    });
  }
  if (context.javaUnits.some((unit) => /\b(?:ObjectGrid|ObjectMap|WXSSessionManager)\b/.test(unit.text))) {
    externalEndpoints.push({
      id: 'external_endpoint:websphere-extreme-scale',
      kind: 'external_endpoint',
      name: 'WebSphere eXtreme Scale',
      technology: 'wxs',
      staticTypes: ['ObjectGrid', 'ObjectMap', 'Session', 'WXSSessionManager'],
    });
  }

  return {
    benchmark: context.name,
    tables: [...tables].sort().map((name) => ({ id: `table:${name}`, kind: 'table', name })),
    entities,
    namedQueries,
    externalEndpoints,
    mappers,
  };
}

function extractJpqlEntities(query) {
  const entities = new Set();
  for (const match of query.matchAll(/\b(?:from|update|delete\s+from)\s+(\w+)/gi)) {
    entities.add(match[1]);
  }
  return [...entities];
}

function buildClassGraph(methodGraph) {
  const nodes = new Map();
  const edges = new Map();
  for (const node of methodGraph.nodes) {
    if (!node.classFqn && node.kind !== 'table') continue;
    const id = node.kind === 'table' ? node.id : `class:${node.classFqn}`;
    nodes.set(id, {
      id,
      kind: node.kind === 'table' ? 'table' : 'class',
      className: node.className,
      classFqn: node.classFqn,
      name: node.name,
    });
  }
  for (const edge of methodGraph.edges) {
    const fromClass = edge.fromNode?.classFqn ? `class:${edge.fromNode.classFqn}` : edge.from;
    const toClass = edge.toNode?.classFqn ? `class:${edge.toNode.classFqn}` : edge.to;
    if (!fromClass || !toClass || fromClass === toClass) continue;
    const key = `${edge.type}:${fromClass}->${toClass}`;
    const current = edges.get(key) ?? { id: key, type: edge.type, source: edge.source, from: fromClass, to: toClass, weight: 0 };
    current.weight += 1;
    edges.set(key, current);
  }
  return { benchmark: methodGraph.benchmark, nodes: [...nodes.values()], edges: [...edges.values()] };
}

function buildChains(context, actionPoints, methodGraph, dataSources) {
  const adjacency = new Map();
  const nodesById = new Map(methodGraph.nodes.map((node) => [node.id, node]));
  const edgesById = new Map(methodGraph.edges.map((edge) => [edge.id, edge]));
  for (const edge of methodGraph.edges) {
    if (!adjacency.has(edge.from)) adjacency.set(edge.from, []);
    adjacency.get(edge.from).push(edge);
  }

  const chains = [];
  for (const [actionIndex, actionPoint] of actionPoints.entries()) {
    const visited = new Set();
    const reachedDataSources = new Set();
    const reachedEdges = new Set();
    const queue = [{ node: actionPoint.methodId, path: [] }];
    const terminalPaths = [];
    while (queue.length) {
      const current = queue.shift();
      if (visited.has(current.node)) continue;
      visited.add(current.node);
      if (isDataSourceNodeId(current.node)) reachedDataSources.add(current.node);
      const nextEdges = adjacency.get(current.node) ?? [];
      if (!nextEdges.length || isDataSourceNodeId(current.node)) {
        terminalPaths.push(current.path);
        continue;
      }
      for (const edge of nextEdges) {
        reachedEdges.add(edge.id);
        const path = [...current.path, edge.id];
        if (isDataSourceNodeId(edge.to)) {
          reachedDataSources.add(edge.to);
          terminalPaths.push(path);
        } else {
          queue.push({ node: edge.to, path });
        }
      }
    }

    const edgePaths = terminalPaths.map((pathIds) => ({
      edgeIds: pathIds,
      edges: pathIds.map((edgeId) => edgesById.get(edgeId)).filter(Boolean),
      nodeIds: edgePathNodeIds(actionPoint.methodId, pathIds, edgesById),
    }));
    const fileName = `${String(actionIndex + 1).padStart(3, '0')}-${slugify(`${actionPoint.className}-${actionPoint.methodName}`)}.json`;

    chains.push({
      id: `chain:${context.name}:${actionIndex + 1}`,
      fileName,
      actionPointId: actionPoint.id,
      rootMethodId: actionPoint.methodId,
      reachedNodeCount: visited.size,
      reachedDataSources: [...reachedDataSources].sort(),
      actionPoint,
      nodes: [...visited]
        .map((id) => nodesById.get(id) ?? { id, kind: id.startsWith('table:') ? 'table' : 'unknown_framework_target' })
        .sort((a, b) => a.id.localeCompare(b.id)),
      edges: [...reachedEdges].map((id) => edgesById.get(id)).filter(Boolean),
      paths: edgePaths,
    });
  }
  return { benchmark: context.name, chains, dataSourceCount: dataSources.tables.length };
}

function buildReport(context, actionPoints, methodGraph, classGraph, dataSources, chains) {
  const lines = [
    `# Extraction Report: ${context.name}`,
    '',
    '## Summary',
    '',
    `- Benchmark: \`${context.name}\``,
    `- Framework profile: \`${context.benchmark.framework}\``,
    '- Runtime execution: not used',
    `- Java files scanned: ${context.javaUnits.length}`,
    `- Resource files scanned: ${context.resourceUnits.length}`,
    `- Action points: ${actionPoints.length}`,
    `- Method graph edges: ${methodGraph.edges.length}`,
    `- Class graph edges: ${classGraph.edges.length}`,
    `- Data tables: ${dataSources.tables.length}`,
    `- Chain files: ${chains.chains.length}`,
    '',
    '## Tool Status',
    '',
    `- CodeQL: ${context.codeql.available ? context.codeql.version : context.codeql.reason}`,
    `- tree-sitter: ${context.treeSitter.available ? 'available and parsed Java files' : context.treeSitter.reason}`,
    '',
    '## Notes',
    '',
    '- CodeQL is the intended authority for call edges, but this run can emit static fallback edges when CodeQL is unavailable.',
    '- Fallback edges are syntactic and field-type based; unresolved dynamic dispatch and framework magic require later CodeQL/config enrichment.',
    '- Benchmark source files were not modified and the benchmark application was not run.',
  ];
  return `${lines.join('\n')}\n`;
}

function edgePathNodeIds(rootNodeId, pathIds, edgesById) {
  const nodeIds = [rootNodeId];
  for (const edgeId of pathIds) {
    const edge = edgesById.get(edgeId);
    if (edge) nodeIds.push(edge.to);
  }
  return nodeIds;
}

function isDataSourceNodeId(id) {
  return id.startsWith('table:') || id.startsWith('external_endpoint:') || id.startsWith('queue:');
}

function summarizeTreeSitter(context) {
  return {
    available: context.treeSitter.available,
    parsedJavaFiles: context.javaUnits.filter((unit) => unit.treeSitterParsed).length,
    totalJavaFiles: context.javaUnits.length,
    reason: context.treeSitter.reason,
  };
}

function methodNode(unit, method) {
  return {
    id: methodId(unit.fqn, method.name),
    kind: 'method',
    className: unit.className,
    classFqn: unit.fqn,
    methodName: method.name,
    file: unit.filePath,
    line: method.line,
  };
}

function methodId(classFqn, methodName) {
  return `method:${classFqn}#${methodName}`;
}

function edgeId(type, from, to, index) {
  return `${type}:${from}->${to}:${index}`;
}

function slugify(value) {
  return value
    .replace(/([a-z0-9])([A-Z])/g, '$1-$2')
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '')
    .slice(0, 120);
}

function dedupeEdges(edges) {
  const seen = new Set();
  return edges.filter((edge) => {
    const key = `${edge.type}:${edge.from}->${edge.to}:${edge.callSite ?? edge.operation ?? ''}`;
    if (seen.has(key)) return false;
    seen.add(key);
    return true;
  }).map((edge, index) => ({ ...edge, id: edgeId(edge.type, edge.from, edge.to, index) }));
}

function extractSqlTables(sqlText) {
  const normalized = sqlText.replace(/\s+/g, ' ');
  const tables = new Set();
  const patterns = [
    /\bjoin\s+([\w.]+)/gi,
    /\bupdate\s+([\w.]+)/gi,
    /\binsert\s+into\s+([\w.]+)/gi,
    /\bdelete\s+from\s+([\w.]+)/gi,
  ];
  for (const fromMatch of normalized.matchAll(/\bfrom\s+(.+?)(?=\bwhere\b|\bgroup\s+by\b|\border\s+by\b|\bhaving\b|\bunion\b|$)/gi)) {
    for (const table of extractTablesFromFromClause(fromMatch[1])) {
      tables.add(table);
    }
  }
  for (const pattern of patterns) {
    for (const match of normalized.matchAll(pattern)) {
      tables.add(match[1].replace(/[",;]/g, '').toLowerCase());
    }
  }
  return [...tables].sort();
}

function extractTablesFromFromClause(fromClause) {
  return fromClause
    .split(',')
    .map((part) => part.trim().split(/\s+/)[0])
    .map((table) => table.replace(/[",;]/g, '').toLowerCase())
    .filter(Boolean);
}

function safeParseXml(parser, text) {
  try {
    return parser.parse(text);
  } catch {
    return null;
  }
}

function collectText(value) {
  if (value == null) return '';
  if (typeof value === 'string') return value;
  if (typeof value !== 'object') return '';
  return Object.entries(value)
    .filter(([key]) => !key.startsWith('@_'))
    .map(([, child]) => Array.isArray(child) ? child.map(collectText).join(' ') : collectText(child))
    .join(' ');
}

function asArray(value) {
  if (value == null) return [];
  return Array.isArray(value) ? value : [value];
}

function cleanType(type) {
  return type.replace(/\b(final|transient|volatile)\b/g, '').replace(/\s+/g, ' ').trim();
}

function simpleType(type) {
  return cleanType(type).replace(/<.*>/, '').split('.').pop();
}

function escapeRegex(value) {
  return value.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

function findMatchingBrace(text, openIndex) {
  let depth = 0;
  let state = 'code';
  for (let i = openIndex; i < text.length; i += 1) {
    const char = text[i];
    const next = text[i + 1];

    if (state === 'line-comment') {
      if (char === '\n') state = 'code';
      continue;
    }
    if (state === 'block-comment') {
      if (char === '*' && next === '/') {
        state = 'code';
        i += 1;
      }
      continue;
    }
    if (state === 'string') {
      if (char === '\\') {
        i += 1;
      } else if (char === '"') {
        state = 'code';
      }
      continue;
    }
    if (state === 'char') {
      if (char === '\\') {
        i += 1;
      } else if (char === "'") {
        state = 'code';
      }
      continue;
    }

    if (char === '/' && next === '/') {
      state = 'line-comment';
      i += 1;
      continue;
    }
    if (char === '/' && next === '*') {
      state = 'block-comment';
      i += 1;
      continue;
    }
    if (char === '"') {
      state = 'string';
      continue;
    }
    if (char === "'") {
      state = 'char';
      continue;
    }

    if (char === '{') depth += 1;
    if (char === '}') depth -= 1;
    if (depth === 0) return i;
  }
  return -1;
}

function lineOf(text, index) {
  return text.slice(0, index).split('\n').length;
}

function matchOne(text, pattern) {
  return text.match(pattern)?.[1] ?? null;
}

export { extractCalls, loadBenchmark, extractBenchmark, BENCHMARKS };

function rel(filePath) {
  return path.relative(ROOT, filePath);
}

async function writeJson(filePath, value) {
  await writeFile(filePath, `${JSON.stringify(value, null, 2)}\n`, 'utf8');
}

async function writeChainOutputs(chainsDir, chainsOutput) {
  await rm(`${chainsDir}.json`, { force: true });
  await rm(chainsDir, { recursive: true, force: true });
  await mkdir(chainsDir, { recursive: true });

  const index = {
    benchmark: chainsOutput.benchmark,
    dataSourceCount: chainsOutput.dataSourceCount,
    chainCount: chainsOutput.chains.length,
    chains: chainsOutput.chains.map((chain) => ({
      id: chain.id,
      file: chain.fileName,
      actionPointId: chain.actionPointId,
      rootMethodId: chain.rootMethodId,
      reachedNodeCount: chain.reachedNodeCount,
      reachedDataSources: chain.reachedDataSources,
      pathCount: chain.paths.length,
    })),
  };

  await writeJson(path.join(chainsDir, 'index.json'), index);
  for (const chain of chainsOutput.chains) {
    await writeJson(path.join(chainsDir, chain.fileName), chain);
  }
}
