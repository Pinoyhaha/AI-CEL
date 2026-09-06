export default async function handler(req,res){
  if(req.method!=='POST')return res.status(405).json({error:'Method not allowed'});
  const token=process.env.HF_TOKEN;
  if(!token)return res.status(500).json({error:'HF_TOKEN is not configured on Vercel.'});
  const message=typeof req.body?.message==='string'?req.body.message.trim():'';
  if(!message)return res.status(400).json({error:'Message is required.'});

  // Set your preferred Hugging Face model in Vercel as HF_MODEL.
  const model=process.env.HF_MODEL||'HuggingFaceH4/zephyr-7b-beta';
  const url=`https://router.huggingface.co/hf-inference/models/${encodeURIComponent(model)}`;

  try{
    const response=await fetch(url,{method:'POST',headers:{Authorization:`Bearer ${token}`,'Content-Type':'application/json'},body:JSON.stringify({inputs:message,parameters:{max_new_tokens:512,return_full_text:false}})});
    const data=await response.json().catch(()=>null);
    if(!response.ok){const detail=data?.error||data?.message||`Hugging Face request failed (${response.status})`;return res.status(response.status).json({error:String(detail)});}
    let reply='';
    if(Array.isArray(data))reply=data[0]?.generated_text||'';
    else if(data&&typeof data.generated_text==='string')reply=data.generated_text;
    else if(typeof data?.text==='string')reply=data.text;
    if(!reply)reply='The model returned an empty response.';
    return res.status(200).json({reply,model});
  }catch(error){return res.status(500).json({error:error?.message||'Server error'});}
}
