#!/usr/bin/env node

import fs from 'fs';
import path from 'path';

const REQUIRED_FIELDS = [
  'severity',
  'impact',
  'evidence',
  'risk',
  'recommendation',
  'suggested_owner',
  'acceptance_criteria',
];

const SEVERITY_ORDER = { P0: 0, P1: 1, P2: 2, P3: 3 };
const DOMAIN_ORDER = { security: 0, stability: 1, transport: 2, ux: 3, optimization: 4 };

function parseArgs(argv) {
  const args = { input: '', output: '', pr: '' };
  for (let i = 2; i < argv.length; i += 1) {
    const token = argv[i];
    if (token === '--input') args.input = argv[++i];
    else if (token === '--output') args.output = argv[++i];
    else if (token === '--pr') args.pr = argv[++i];
  }
  if (!args.input || !args.output || !args.pr) {
    throw new Error('Uso: node consolidate-findings.mjs --input <dir> --output <file.md> --pr <id>');
  }
  return args;
}

function normalizeText(value) {
  return String(value || '')
    .toLowerCase()
    .replace(/[^\p{L}\p{N}\s]/gu, ' ')
    .replace(/\s+/g, ' ')
    .trim();
}

function inferDomain(finding) {
  if (finding.domain && DOMAIN_ORDER[finding.domain] !== undefined) return finding.domain;
  const corpus = normalizeText(`${finding.impact} ${finding.risk} ${finding.evidence} ${finding.recommendation}`);
  if (/(auth|permis|keycloak|security|seguridad|privileg|token|usuario)/.test(corpus)) return 'security';
  if (/(crash|caida|timeout|degrad|estabilidad|performance|latencia|retry)/.test(corpus)) return 'stability';
  if (/(gtfs|osrm|mapa|ruta|trips|stops|shape|segmento|geometr)/.test(corpus)) return 'transport';
  if (/(ux|usabilidad|flujo|interfaz|feedback|accesibilidad)/.test(corpus)) return 'ux';
  return 'optimization';
}

function validateFinding(finding, context) {
  for (const field of REQUIRED_FIELDS) {
    if (!finding[field] || String(finding[field]).trim() === '') {
      throw new Error(`Hallazgo inválido en ${context}: falta campo '${field}'`);
    }
  }
  if (SEVERITY_ORDER[finding.severity] === undefined) {
    throw new Error(`Hallazgo inválido en ${context}: severity debe ser P0..P3`);
  }
}

function readAgentFiles(inputDir, expectedPr) {
  const files = fs.readdirSync(inputDir).filter((f) => f.endsWith('.json'));
  if (files.length === 0) throw new Error(`No hay archivos JSON en ${inputDir}`);

  const items = [];
  for (const file of files) {
    const fullPath = path.join(inputDir, file);
    const payload = JSON.parse(fs.readFileSync(fullPath, 'utf8'));
    if (!payload.agent || !Array.isArray(payload.findings)) {
      throw new Error(`Archivo inválido: ${file}`);
    }
    if (String(payload.pr_id) !== String(expectedPr)) {
      throw new Error(`PR mismatch en ${file}: esperado ${expectedPr}, recibido ${payload.pr_id}`);
    }

    payload.findings.forEach((finding, index) => {
      validateFinding(finding, `${file}#${index + 1}`);
      items.push({
        ...finding,
        agent: payload.agent,
        domain: inferDomain(finding),
      });
    });
  }
  return items;
}

function deduplicate(items) {
  const map = new Map();
  for (const item of items) {
    const key = `${normalizeText(item.evidence)}|${normalizeText(item.risk)}`;
    const existing = map.get(key);
    if (!existing) {
      map.set(key, { ...item, agents: [item.agent] });
      continue;
    }
    existing.agents = Array.from(new Set([...existing.agents, item.agent]));
    if (SEVERITY_ORDER[item.severity] < SEVERITY_ORDER[existing.severity]) existing.severity = item.severity;
    if (DOMAIN_ORDER[item.domain] < DOMAIN_ORDER[existing.domain]) existing.domain = item.domain;
  }
  return Array.from(map.values());
}

function sortItems(items) {
  return items.sort((a, b) => {
    const severityDelta = SEVERITY_ORDER[a.severity] - SEVERITY_ORDER[b.severity];
    if (severityDelta !== 0) return severityDelta;
    const domainDelta = DOMAIN_ORDER[a.domain] - DOMAIN_ORDER[b.domain];
    if (domainDelta !== 0) return domainDelta;
    return a.risk.localeCompare(b.risk);
  });
}

function renderMarkdown(prId, items) {
  const lines = [];
  lines.push(`# Backlog Consolidado PR ${prId}`);
  lines.push('');
  lines.push(`Generado: ${new Date().toISOString()}`);
  lines.push('');
  lines.push('| ID | Severidad | Dominio | Agentes | Impacto | Riesgo | Dueño sugerido | Criterio de aceptación |');
  lines.push('|---|---|---|---|---|---|---|---|');

  items.forEach((item, idx) => {
    const id = `${prId}-${String(idx + 1).padStart(2, '0')}`;
    lines.push(
      `| ${id} | ${item.severity} | ${item.domain} | ${item.agents.join(', ')} | ${sanitizeCell(item.impact)} | ${sanitizeCell(item.risk)} | ${sanitizeCell(item.suggested_owner)} | ${sanitizeCell(item.acceptance_criteria)} |`
    );
  });

  lines.push('');
  lines.push('## Evidencia y recomendación por ítem');
  lines.push('');

  items.forEach((item, idx) => {
    const id = `${prId}-${String(idx + 1).padStart(2, '0')}`;
    lines.push(`### ${id} (${item.severity})`);
    lines.push(`- Evidencia: ${item.evidence}`);
    lines.push(`- Recomendación: ${item.recommendation}`);
    lines.push(`- Estado inicial: OPEN`);
    lines.push('');
  });

  const blocking = items.filter((item) => item.severity === 'P0' || item.severity === 'P1');
  lines.push('## Gate de cierre');
  lines.push('');
  lines.push(
    blocking.length > 0
      ? `PR bloqueado: ${blocking.length} hallazgo(s) P0/P1 abiertos.`
      : 'PR elegible para cierre: no hay hallazgos P0/P1.'
  );

  return lines.join('\n');
}

function sanitizeCell(text) {
  return String(text || '').replace(/\|/g, '\\|').replace(/\n/g, ' ').trim();
}

function main() {
  const args = parseArgs(process.argv);
  const inputDir = path.resolve(args.input);
  const outputFile = path.resolve(args.output);
  const prId = String(args.pr);

  if (!fs.existsSync(inputDir)) throw new Error(`No existe directorio de entrada: ${inputDir}`);

  const loaded = readAgentFiles(inputDir, prId);
  const deduped = deduplicate(loaded);
  const ordered = sortItems(deduped);
  const markdown = renderMarkdown(prId, ordered);

  fs.mkdirSync(path.dirname(outputFile), { recursive: true });
  fs.writeFileSync(outputFile, markdown, 'utf8');

  console.log(`Consolidación completada.`);
  console.log(`- Entradas: ${loaded.length}`);
  console.log(`- Únicos: ${ordered.length}`);
  console.log(`- Salida: ${outputFile}`);
}

try {
  main();
} catch (error) {
  console.error(`Error: ${error.message}`);
  process.exit(1);
}
