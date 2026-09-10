import {test} from 'node:test'
import assert from 'node:assert/strict'
import {spawnSync} from 'node:child_process'
import {randomUUID,createHash} from 'node:crypto'
import {createRequire} from 'node:module'
import {fileURLToPath} from 'node:url'
const require=createRequire(new URL('../../api/package.json',import.meta.url))
const {S3Client,CreateBucketCommand,PutObjectCommand,GetObjectCommand}=require('@aws-sdk/client-s3')
const {getSignedUrl}=require('@aws-sdk/s3-request-presigner')
const docker=(args)=>{const r=spawnSync('docker',args,{encoding:'utf8',windowsHide:true,timeout:60000});assert.equal(r.status,0,r.stderr);return r.stdout.trim()}
test('真实附件代理拒绝未签名流式请求，正常预签名上传下载可用',async()=>{
 const id=randomUUID(),network=`itpc-ingress-${id}`,storage=`itpc-s3-${id}`,gateway=`itpc-gateway-${id}`
 let networkCreated=false,storageCreated=false,gatewayCreated=false,s3,signing
 const endpoint=name=>{const binding=docker(['port',name,name===gateway?'8080/tcp':'9000/tcp']);assert.match(binding,/^127\.0\.0\.1:\d+$/);return `http://${binding}`}
 try{
  docker(['network','create',network]);networkCreated=true
  docker(['run','-d','--name',storage,'--network',network,'--network-alias','minio','-p','127.0.0.1::9000','-e','MINIO_ROOT_USER=fixture-admin','-e','MINIO_ROOT_PASSWORD=fixture-password-local-only',process.env.ITPC_MINIO_TEST_IMAGE||'itpc-minio:14cea493d9a3','server','/data']);storageCreated=true
  const direct=endpoint(storage)
  let ready=false
  for(let i=0;i<30;i++){try{if((await fetch(`${direct}/minio/health/ready`)).ok){ready=true;break}}catch{}await new Promise(r=>setTimeout(r,200))}
  assert.ok(ready,'isolated storage not ready')
  docker(['run','-d','--name',gateway,'--network',network,'--add-host','api:127.0.0.1','-p','127.0.0.1::8080','--mount',`type=bind,source=${fileURLToPath(new URL('../../deploy/nginx.conf',import.meta.url))},target=/etc/nginx/conf.d/default.conf,readonly`,'nginx:1.27-alpine']);gatewayCreated=true
  docker(['exec',gateway,'nginx','-t'])
  const proxy=endpoint(gateway)
  const options={region:'us-east-1',forcePathStyle:true,credentials:{accessKeyId:'fixture-admin',secretAccessKey:'fixture-password-local-only'},requestChecksumCalculation:'WHEN_REQUIRED'}
  s3=new S3Client({...options,endpoint:direct});signing=new S3Client({...options,endpoint:proxy})
  await s3.send(new CreateBucketCommand({Bucket:'it-project-console'}))
  const object={Bucket:'it-project-console',Key:`fixture-${id}`},body='signed-attachment-fixture'
  const upload=await getSignedUrl(signing,new PutObjectCommand({...object,ContentType:'text/plain'}),{expiresIn:60})
  assert.equal((await fetch(upload,{method:'PUT',headers:{'content-type':'text/plain'},body})).status,200)
  const download=await getSignedUrl(signing,new GetObjectCommand(object),{expiresIn:60})
  assert.equal(await (await fetch(download)).text(),body)
  const largeBody=Buffer.alloc(100*1024*1024,0x61),largeObject={Bucket:'it-project-console',Key:`large-${id}`}
  const largeUpload=await getSignedUrl(signing,new PutObjectCommand({...largeObject,ContentType:'application/octet-stream'}),{expiresIn:300})
  assert.equal((await fetch(largeUpload,{method:'PUT',headers:{'content-type':'application/octet-stream'},body:largeBody})).status,200)
  const largeDownload=await getSignedUrl(signing,new GetObjectCommand(largeObject),{expiresIn:300})
  const received=Buffer.from(await (await fetch(largeDownload)).arrayBuffer())
  assert.equal(received.length,largeBody.length)
  assert.equal(createHash('sha256').update(received).digest('hex'),createHash('sha256').update(largeBody).digest('hex'))
  assert.equal((await fetch(largeUpload,{method:'PUT',headers:{'content-type':'application/octet-stream'},body:Buffer.alloc(100*1024*1024+1)})).status,413)
  for(const value of ['STREAMING-UNSIGNED-PAYLOAD-TRAILER','streaming-unsigned-payload-trailer','UNSIGNED-PAYLOAD, STREAMING-UNSIGNED-PAYLOAD-TRAILER']){
   const r=await fetch(`${proxy}/it-project-console/rejected?X-Amz-Credential=fixture-admin`,{method:'PUT',headers:{'X-Amz-Content-Sha256':value,'X-Amz-Meta-Snowball-Auto-Extract':'true'},body:'fixture'})
   assert.equal(r.status,403);assert.equal(await r.text(),'Unsupported upload encoding.\n')
  }
 }finally{
  s3?.destroy();signing?.destroy()
  try{if(gatewayCreated)docker(['rm','-f','-v',gateway])}finally{try{if(storageCreated)docker(['rm','-f','-v',storage])}finally{if(networkCreated)docker(['network','rm',network])}}
 }
})
