import {createRequire} from 'node:module'
import {createHash} from 'node:crypto'
import {parseEnv} from '/app/dist/config/env.js'
import {createPrisma} from '/app/dist/plugins/prisma.js'
const require=createRequire('/app/package.json')
const {S3Client,GetObjectCommand,ListObjectsV2Command}=require('@aws-sdk/client-s3')
const env=parseEnv(process.env)
const url=new URL(env.DATABASE_URL);url.hostname='postgres'
const db=createPrisma(url.toString())
const s3=new S3Client({endpoint:'http://minio:9000',region:env.S3_REGION,forcePathStyle:true,
 credentials:{accessKeyId:env.S3_ACCESS_KEY,secretAccessKey:env.S3_SECRET_KEY}})
try {
 const objects=[];let token
 do {
  const page=await s3.send(new ListObjectsV2Command({Bucket:env.S3_BUCKET,ContinuationToken:token}))
  for(const item of page.Contents??[]){
   const r=await s3.send(new GetObjectCommand({Bucket:env.S3_BUCKET,Key:item.Key}))
   const bytes=await r.Body.transformToByteArray()
   objects.push({key:item.Key,size:bytes.length,mime:r.ContentType,sha256:createHash('sha256').update(bytes).digest('hex')})
  }
  token=page.IsTruncated?page.NextContinuationToken:undefined
 }while(token)
 objects.sort((a,b)=>a.key.localeCompare(b.key))
 const attachments=await db.attachment.findMany({where:{status:'READY'},select:{id:true,objectKey:true,size:true},orderBy:{id:'asc'}})
 for(const a of attachments){const obj=objects.find(o=>o.key===a.objectKey);if(!obj||obj.size!==a.size)throw Error('ATTACHMENT_OBJECT_MISMATCH')}
 console.log(JSON.stringify({objects,attachments}))
}finally{await db.$disconnect();s3.destroy()}
