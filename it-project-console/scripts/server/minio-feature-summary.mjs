// Emit only fixed diagnostic labels; never echo untrusted response fields.
let input='';for await(const c of process.stdin)input+=c
const records=input.split('\n').filter(Boolean).map(line=>{
 const notConfigured=/not enabled|not configured|no replication configuration|replication configuration does not exist|no remote tier targets found|NoSuchConfiguration/i.test(line)
 try {
  const obj=JSON.parse(line)
  return {status:obj?.status==='success'?'success':obj?.status==='error'?'error':'unknown',notConfigured}
 } catch {
  return {format:'text',notConfigured,unrecognized:!notConfigured}
 }
})
console.log(JSON.stringify({records}))
