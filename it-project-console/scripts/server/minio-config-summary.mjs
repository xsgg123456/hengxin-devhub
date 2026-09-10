// stdin only: never persist or print raw configuration/credentials.
let input=''
for await(const chunk of process.stdin)input+=chunk
const endpointKeys=new Set(['config_url','client_id','client_secret','server_addr','endpoint','endpoints','url','url_v1','brokers','address','server','queue_dir','dsn','connection_string'])
const subsystems=new Set(['identity_openid','identity_ldap','identity_tls','identity_plugin','policy_plugin','etcd','kms_kes','kms_vault','logger_webhook','audit_webhook','notify_webhook','notify_amqp','notify_kafka','notify_mqtt','notify_nats','notify_nsq','notify_mysql','notify_postgres','notify_elasticsearch','notify_redis'])
const lines=[]
for(const original of input.split('\n')){
 if(!original.trim())continue
 const commented=original.trimStart().startsWith('#'),line=original.trimStart().replace(/^#\s*/,'')
 const subsystem=line.trim().split(/\s+/)[0].split(':')[0]
 if(!subsystems.has(subsystem))continue
 const fields={}
 for(const match of line.matchAll(/(?:^|\s)([a-z_]+)=("(?:[^"\\]|\\.)*"|\S*)/g)){
  const value=match[2].replace(/^"|"$/g,'')
  if(match[1]==='enable')fields.enabled=value==='on'
  else if(endpointKeys.has(match[1]))fields[match[1]+'_present']=value!==''
 }
 lines.push({subsystem,commented,...fields})
}
if(!lines.length)throw Error('No config entries; audit did not succeed')
console.log(JSON.stringify({configuredSubsystems:lines}))
