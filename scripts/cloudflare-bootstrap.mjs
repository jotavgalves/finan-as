import { execFileSync } from 'node:child_process';
import { mkdirSync, rmSync, writeFileSync } from 'node:fs';
import { randomBytes } from 'node:crypto';
import process from 'node:process';

const PROJECT = process.env.CLOUDFLARE_PAGES_PROJECT || 'finan-as';
const PROD_DB = process.env.CLOUDFLARE_D1_PROD || 'finan-as-prod';
const PREVIEW_DB = process.env.CLOUDFLARE_D1_PREVIEW || 'finan-as-preview';
const PRODUCTION_BRANCH = process.env.CLOUDFLARE_PRODUCTION_BRANCH || 'main';
const npx = process.platform === 'win32' ? 'npx.cmd' : 'npx';
const workDir = '.wrangler/bootstrap';
mkdirSync(workDir,{recursive:true});

for(const required of ['CLOUDFLARE_API_TOKEN','CLOUDFLARE_ACCOUNT_ID','ADMIN_PASSWORD']){
  if(!process.env[required]) throw new Error(`${required} não configurado.`);
}

function run(args,{capture=false,allowFailure=false}={}){
  const printable=['wrangler',...args].join(' ');
  console.log(`> ${printable}`);
  try{
    return execFileSync(npx,['wrangler',...args],{encoding:'utf8',stdio:capture?['ignore','pipe','inherit']:'inherit',env:process.env});
  }catch(error){if(allowFailure)return '';throw error;}
}
function jsonFrom(text){
  const clean=String(text||'').trim();
  for(let i=0;i<clean.length;i++){
    if(clean[i]!=='['&&clean[i]!=='{')continue;
    try{return JSON.parse(clean.slice(i))}catch{}
  }
  throw new Error('Wrangler não retornou JSON válido.');
}
function asArray(value,...keys){if(Array.isArray(value))return value;for(const k of keys)if(Array.isArray(value?.[k]))return value[k];return []}
function listDatabases(){return asArray(jsonFrom(run(['d1','list','--json'],{capture:true})),'result','databases')}
function ensureDatabase(name){
  let db=listDatabases().find(x=>x.name===name);
  if(!db){console.log(`Criando D1 ${name}...`);run(['d1','create',name]);db=listDatabases().find(x=>x.name===name)}
  if(!db)throw new Error(`Não foi possível localizar o D1 ${name} após criação.`);
  return {name,id:db.uuid||db.id||db.database_id};
}
function listProjects(){return asArray(jsonFrom(run(['pages','project','list','--json'],{capture:true})),'result','projects')}
function ensureProject(){
  const exists=listProjects().some(x=>x.name===PROJECT||x.project_name===PROJECT);
  if(!exists)run(['pages','project','create',PROJECT,'--production-branch',PRODUCTION_BRANCH]);
}

const prod=ensureDatabase(PROD_DB),preview=ensureDatabase(PREVIEW_DB);
ensureProject();

const configPath=`${workDir}/wrangler.generated.jsonc`;
const config={
  $schema:'../../node_modules/wrangler/config-schema.json',
  name:PROJECT,
  pages_build_output_dir:'../../dist',
  compatibility_date:'2026-09-04',
  d1_databases:[{binding:'DB',database_name:prod.name,database_id:prod.id}],
  env:{preview:{d1_databases:[{binding:'DB',database_name:preview.name,database_id:preview.id}]}}
};
writeFileSync(configPath,JSON.stringify(config,null,2));
console.log(`Config gerada em ${configPath}`);

console.log('Aplicando migrations em produção...');
run(['d1','migrations','apply',PROD_DB,'--remote','--config',configPath]);
console.log('Aplicando migrations em preview...');
run(['d1','migrations','apply',PREVIEW_DB,'--remote','--config',configPath]);

const sessionSecret=process.env.SESSION_SECRET||randomBytes(64).toString('hex');
const secrets={
  ADMIN_PASSWORD:process.env.ADMIN_PASSWORD,
  SESSION_SECRET:sessionSecret,
  SESSION_TTL_DAYS:process.env.SESSION_TTL_DAYS||'30'
};
if(process.env.TURNSTILE_SECRET)secrets.TURNSTILE_SECRET=process.env.TURNSTILE_SECRET;
if(process.env.TURNSTILE_SITE_KEY)secrets.TURNSTILE_SITE_KEY=process.env.TURNSTILE_SITE_KEY;
const secretPath=`${workDir}/pages-secrets.json`;
writeFileSync(secretPath,JSON.stringify(secrets));
try{
  console.log('Atualizando secrets de produção...');
  run(['pages','secret','bulk',secretPath,'--project-name',PROJECT,'--env','production','--config',configPath]);
  console.log('Atualizando secrets de preview...');
  run(['pages','secret','bulk',secretPath,'--project-name',PROJECT,'--env','preview','--config',configPath]);
}finally{rmSync(secretPath,{force:true})}

const deployArgs=['pages','deploy','dist','--project-name',PROJECT,'--branch',PRODUCTION_BRANCH,'--config',configPath];
if(process.env.GITHUB_SHA)deployArgs.push('--commit-hash',process.env.GITHUB_SHA);
if(process.env.GITHUB_COMMIT_MESSAGE)deployArgs.push('--commit-message',process.env.GITHUB_COMMIT_MESSAGE.slice(0,120));
console.log('Publicando Pages...');
run(deployArgs);
console.log(`Deploy concluído: https://${PROJECT}.pages.dev`);
