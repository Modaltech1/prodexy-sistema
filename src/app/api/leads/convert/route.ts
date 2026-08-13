import { NextRequest } from "next/server";
import { getSupabaseAdmin } from "@/lib/supabase/admin";
import { badRequest, ok, readJson, serverError } from "@/lib/api";
import { todayInSaoPaulo } from "@/lib/date";

export async function POST(request: NextRequest){
 try{const{lead_id}=await readJson<{lead_id:string}>(request);if(!lead_id)return badRequest("Lead obrigatório.");const supabase=getSupabaseAdmin();const{data:lead,error}=await supabase.from("leads").select("*").eq("id",lead_id).single();if(error)throw error;if(lead.won_client_id)return ok({client_id:lead.won_client_id,already_converted:true});
 const clientName=lead.company||lead.name;const{data:client,error:clientError}=await supabase.from("clients").insert({name:clientName,company_name:lead.company||null,contact_name:lead.company?lead.name:null,phone:lead.phone,email:lead.email,status:"active",entry_date:todayInSaoPaulo(),notes:lead.notes}).select("*").single();if(clientError)throw clientError;
 if(lead.interest_project_id){const{data:project}=await supabase.from("projects").select("project_type").eq("id",lead.interest_project_id).maybeSingle();await supabase.from("project_clients").insert({project_id:lead.interest_project_id,client_id:client.id,relationship_type:project?.project_type==="saas"?"subscriber":"client",active:true});}
 await supabase.from("leads").update({stage:"won",won_client_id:client.id,last_contact_at:new Date().toISOString()}).eq("id",lead_id);await supabase.from("lead_activities").insert({lead_id,activity_type:"stage_change",description:`Lead convertido em cliente: ${client.name}`});return ok({client_id:client.id});
 }catch(error){return serverError(error)}
}
