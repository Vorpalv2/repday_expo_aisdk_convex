// Validates inline rules with the Firebase Rules Test API. All request/resource
// data below is synthetic; no user documents are read or written by these rules.
// Run with firebase-tools available (e.g. npm exec --package firebase-tools --
// node scripts/check-coach-rules.mjs), or set FIREBASE_TOOLS_DIR to its package root.
import fs from 'node:fs';import path from 'node:path';import {createRequire} from 'node:module';
const require=createRequire(import.meta.url);
let root=process.env.FIREBASE_TOOLS_DIR;
if(!root){try{root=path.dirname(require.resolve('firebase-tools/package.json'));}catch{for(const directory of (process.env.PATH||'').split(path.delimiter)){const binary=path.join(directory,'firebase');if(fs.existsSync(binary)){root=path.resolve(path.dirname(fs.realpathSync(binary)),'../..');break;}}}}
if(!root)throw new Error('firebase-tools is required. Set FIREBASE_TOOLS_DIR or run through npm exec --package firebase-tools.');
const {requireAuth}=require(path.join(root,'lib/requireAuth.js')),{getGlobalDefaultAccount}=require(path.join(root,'lib/auth.js'));
const {Client}=require(path.join(root,'lib/apiv2.js')),{rulesOrigin}=require(path.join(root,'lib/api.js'));
const project=process.env.FIREBASE_PROJECT_ID||'repday-expo';
await requireAuth({project,nonInteractive:true,...getGlobalDefaultAccount()});
const good={version:1,title:'Synthetic chat',preview:'A test reply',contextTitle:'Rest day',contextText:'No real workout data',transcript:'[{"id":"u","role":"user","text":"test"},{"id":"a","role":"assistant","text":"reply"}]',createdAt:1000,updatedAt:1000,revision:1};
const cases=[];
function add(label,expectation,method,actor='rules-test-owner',data=good,previous=good,kind='coachConversations'){
 cases.push({label,expectation,request:{path:`/databases/(default)/documents/users/rules-test-owner/${kind}/synthetic-chat`,method,auth:actor?{uid:actor,token:{sub:actor}}:null,resource:{data}},resource:{data:previous},pathEncoding:'PLAIN'});
}
add('owner creates','ALLOW','create');add('owner reads','ALLOW','get');add('owner lists','ALLOW','list');add('owner deletes','ALLOW','delete');
add('owner updates next revision','ALLOW','update','rules-test-owner',{...good,revision:2,updatedAt:2000});
for(const method of ['get','list','create','update','delete']){add(`other user ${method}`,'DENY',method,'rules-test-other');add(`anonymous ${method}`,'DENY',method,null);}
add('cannot skip revision','DENY','update','rules-test-owner',{...good,revision:3});
add('cannot rewrite original creation time','DENY','update','rules-test-owner',{...good,createdAt:999,revision:2});
add('cannot add entitlement fields','DENY','create','rules-test-owner',{...good,manualPlusAccess:true});
add('cannot inject foreign owner','DENY','create','rules-test-owner',{...good,userId:'rules-test-other'});
add('reject oversized context','DENY','create','rules-test-owner',{...good,contextText:'x'.repeat(4001)});
add('reject oversized transcript','DENY','create','rules-test-owner',{...good,transcript:'x'.repeat(200001)});
add('reject malformed transcript type','DENY','create','rules-test-owner',{...good,transcript:{}});
add('reject unknown sibling collection','DENY','create','rules-test-owner',good,good,'otherCoachData');
const source={files:[{name:'firestore.rules',content:fs.readFileSync(new URL('../firestore.rules',import.meta.url),'utf8')}]};
const client=new Client({urlPrefix:rulesOrigin(),apiVersion:'v1'});
const result=await client.post(`/projects/${project}:test`,{source,testSuite:{testCases:cases.map(({label,...test})=>test)}},{skipLog:{body:true}});
const data=result.body;const errors=(data.issues||[]).filter(issue=>issue.severity==='ERROR');
if(errors.length){console.log(JSON.stringify({errors}));process.exitCode=1;}
let failures=0;for(let index=0;index<cases.length;index++){const test=data.testResults?.[index];if(test?.state!=='SUCCESS'){failures++;console.log(JSON.stringify({case:cases[index].label,result:test}));}}
console.log(JSON.stringify({syntheticRulesCases:cases.length,passed:cases.length-failures,failed:failures,syntaxErrors:errors.length}));if(failures)process.exitCode=1;
