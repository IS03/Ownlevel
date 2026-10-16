-- Step 5 EXPAND. Legacy wire shapes and four-field mutation hashes remain unchanged.
-- Daily values and their historical truth are never modified.
begin;
create schema if not exists ownlevel_private;
revoke all on schema ownlevel_private from public,anon;
grant usage on schema ownlevel_private to authenticated;

alter table public.user_metrics
 add column icon text null,
 add column quick_value numeric null,
 add constraint user_metrics_icon_format check (icon is null or icon ~ '^[a-z][a-z0-9-]{0,31}$'),
 add constraint user_metrics_quick_value_domain check (quick_value is null or (
   quick_value > 0 and quick_value <= 9999999999.9999 and quick_value = round(quick_value,4)
   and (value_type='decimal' or quick_value=trunc(quick_value))
 ));
-- Existing owner RLS and updated_at trigger protect both new columns, including Web writes.

create function ownlevel_private.mobile_normalize_metric_presentation_fields(p jsonb)
returns jsonb language plpgsql immutable set search_path='' as $$
declare f jsonb; q numeric; i text;
begin
 if jsonb_typeof(p) is distinct from 'object' then
  raise exception using errcode='22023',message='INVALID_METRIC_DEFINITION';
 end if;
 if (select count(*) from jsonb_object_keys(p))=4 then
  return public.mobile_normalize_metric_fields(p);
 end if;
 if (select count(*) from jsonb_object_keys(p))<>6 or not p ?& array['name','valueType','unit','target','icon','quickValue']
  or jsonb_typeof(p->'icon') not in ('string','null') or jsonb_typeof(p->'quickValue') not in ('number','null') then
  raise exception using errcode='22023',message='INVALID_METRIC_DEFINITION';
 end if;
 f:=public.mobile_normalize_metric_fields(p-'icon'-'quickValue');
 i:=p->>'icon'; q:=(p->>'quickValue')::numeric;
 if (i is not null and i !~ '^[a-z][a-z0-9-]{0,31}$') or
  (q is not null and (q<=0 or q>9999999999.9999 or q<>round(q,4) or (f->>'valueType'<>'decimal' and q<>trunc(q)))) then
  raise exception using errcode='22023',message='INVALID_METRIC_DEFINITION';
 end if;
 return f || jsonb_build_object('icon',i,'quickValue',q);
end;
$$;
revoke all on function ownlevel_private.mobile_normalize_metric_presentation_fields(jsonb) from public,anon,authenticated;

-- Opt-in RPC only. The original read and every embedded definition DTO stay unchanged.
create function ownlevel_private.mobile_read_metric_presentations()
returns jsonb language plpgsql security definer set search_path='' set timezone='UTC' as $$
declare u uuid:=(select auth.uid()); legacy jsonb; result jsonb;
begin
 if u is null then raise exception using errcode='PT401',message='UNAUTHORIZED'; end if;
 legacy:=public.mobile_read_metric_definitions();
 select coalesce(jsonb_agg(d || jsonb_build_object('icon',m.icon,'quickValue',m.quick_value) order by ord),'[]'::jsonb)
 into result from jsonb_array_elements(legacy->'definitions') with ordinality a(d,ord)
 join public.user_metrics m on m.id=(d->>'id')::uuid and m.user_id=u;
 return jsonb_build_object('definitions',result);
end;
$$;
revoke all on function ownlevel_private.mobile_read_metric_presentations() from public,anon,authenticated;
grant execute on function ownlevel_private.mobile_read_metric_presentations() to authenticated;
create function public.mobile_read_metric_presentations()
returns jsonb language sql security invoker set search_path='' as $$
 select ownlevel_private.mobile_read_metric_presentations()
$$;
revoke all on function public.mobile_read_metric_presentations() from public,anon;
grant execute on function public.mobile_read_metric_presentations() to authenticated;

create function ownlevel_private.mobile_mutate_metric_definition(p_intent jsonb)
returns table(response_status smallint,response_body jsonb,replayed boolean)
language plpgsql security definer set search_path='' set timezone='UTC' set lock_timeout='3s' set statement_timeout='8s' as $$
declare u uuid:=(select auth.uid()); op text; k text; mid uuid; expected timestamptz; f jsonb; normalized jsonb; hash text;
 ledger public.mobile_idempotency_keys; m public.user_metrics; history boolean:=false; code smallint:=200; result jsonb; next_order integer;
begin
 if u is null then raise exception using errcode='PT401',message='UNAUTHORIZED'; end if;
 if jsonb_typeof(p_intent) is distinct from 'object' or (select count(*) from jsonb_object_keys(p_intent))<>5
  or not p_intent ?& array['operation','metricId','expectedUpdatedAt','fields','idempotencyKey']
  or jsonb_typeof(p_intent->'operation') is distinct from 'string'
  or p_intent->>'operation' not in ('create','update','archive','restore','delete')
  or jsonb_typeof(p_intent->'metricId') not in ('string','null') or jsonb_typeof(p_intent->'expectedUpdatedAt') not in ('string','null')
  or jsonb_typeof(p_intent->'idempotencyKey') is distinct from 'string' or coalesce(p_intent->>'idempotencyKey','') !~ '^[A-Za-z0-9._:-]{1,128}$' then
  raise exception using errcode='22023',message='INVALID_METRIC_DEFINITION';
 end if;
 op:=p_intent->>'operation'; k:=p_intent->>'idempotencyKey';
 if op='create' then
  if jsonb_typeof(p_intent->'metricId')<>'null' or jsonb_typeof(p_intent->'expectedUpdatedAt')<>'null' then
   raise exception using errcode='22023',message='INVALID_METRIC_DEFINITION';
  end if;
 else
  if jsonb_typeof(p_intent->'metricId')<>'string' or jsonb_typeof(p_intent->'expectedUpdatedAt')<>'string' then
   raise exception using errcode='22023',message='INVALID_METRIC_DEFINITION';
  end if;
  mid:=(p_intent->>'metricId')::uuid; expected:=(p_intent->>'expectedUpdatedAt')::timestamptz;
  if not isfinite(expected) then raise exception using errcode='22023',message='INVALID_METRIC_DEFINITION'; end if;
 end if;
 if op in ('create','update') then f:=ownlevel_private.mobile_normalize_metric_presentation_fields(p_intent->'fields');
 elsif jsonb_typeof(p_intent->'fields')<>'null' then raise exception using errcode='22023',message='INVALID_METRIC_DEFINITION'; end if;
 normalized:=jsonb_build_object('operation',op,'metricId',mid,'expectedUpdatedAt',expected,'fields',f);
 hash:=encode(extensions.digest(convert_to(normalized::text,'UTF8'),'sha256'),'hex');
 perform pg_advisory_xact_lock(hashtextextended(u::text,412));
 insert into public.mobile_idempotency_keys(user_id,operation,idempotency_key,request_hash,expires_at)
 values(u,'metrics.definition.v1',k,hash,'infinity') on conflict(user_id,operation,idempotency_key) do nothing;
 select * into ledger from public.mobile_idempotency_keys where user_id=u and operation='metrics.definition.v1' and idempotency_key=k for update;
 if ledger.request_hash<>hash then
  return query select 409::smallint,jsonb_build_object('error','IDEMPOTENCY_KEY_REUSED','message','Este cambio ya tiene otros datos.'),false; return;
 end if;
 if ledger.state='completed' then return query select ledger.response_status,ledger.response_body,true; return; end if;
 begin
  if op<>'create' then
   -- FOR UPDATE also waits for any in-flight value insert (its FK key-share lock),
   -- so the history checks below can never miss a concurrent first value.
   select * into m from public.user_metrics where id=mid and user_id=u for update;
   if m.id is null then raise exception using errcode='P0533',message='NOT_FOUND'; end if;
   if m.updated_at is distinct from expected then raise exception using errcode='P0532',message='METRIC_CHANGED'; end if;
   history:=exists(select 1 from public.daily_metric_values v where v.user_id=u and v.metric_id=m.id);
  end if;
  if op in ('create','restore') then
   select coalesce(max(sort_order),-1)+1 into next_order from public.user_metrics where user_id=u and is_active;
  end if;
  if op='create' then
   insert into public.user_metrics(user_id,system_key,name,unit,value_type,target_value,sort_order,is_active,archived_at,icon,quick_value)
   values(u,null,f->>'name',f->>'unit',f->>'valueType',(f->>'target')::numeric,next_order,true,null,f->>'icon',(f->>'quickValue')::numeric) returning * into m;
  elsif op='update' then
   if m.system_key is not null and (f->>'name' is distinct from m.name or f->>'unit' is distinct from m.unit or f->>'valueType' is distinct from m.value_type) then
    raise exception using errcode='P0532',message='SYSTEM_METRIC_IMMUTABLE';
   end if;
   if history and (f->>'unit' is distinct from m.unit or f->>'valueType' is distinct from m.value_type) then
    raise exception using errcode='P0532',message='METRIC_HAS_HISTORY';
   end if;
   update public.user_metrics set name=f->>'name',unit=f->>'unit',value_type=f->>'valueType',target_value=(f->>'target')::numeric,
    icon=case when f ? 'icon' then f->>'icon' else icon end,
    quick_value=case when f ? 'quickValue' then (f->>'quickValue')::numeric else quick_value end
   where id=m.id and user_id=u returning * into m;
  elsif op='archive' then
   if not m.is_active then raise exception using errcode='P0532',message='METRIC_CHANGED'; end if;
   update public.user_metrics set is_active=false,archived_at=statement_timestamp() where id=m.id and user_id=u returning * into m;
  elsif op='restore' then
   if m.is_active then raise exception using errcode='P0532',message='METRIC_CHANGED'; end if;
   update public.user_metrics set is_active=true,archived_at=null,sort_order=next_order where id=m.id and user_id=u returning * into m;
  else
   if m.system_key is not null then raise exception using errcode='P0532',message='SYSTEM_METRIC_PROTECTED'; end if;
   if history then raise exception using errcode='P0532',message='METRIC_HAS_HISTORY'; end if;
   begin
    delete from public.user_metrics where id=m.id and user_id=u;
   exception when foreign_key_violation then raise exception using errcode='P0532',message='METRIC_HAS_HISTORY';
   end;
  end if;
  result:=jsonb_build_object('status','confirmed','operation',op,'metricId',m.id,
   'definition',case when op='delete' then null else public.mobile_metric_definition_dto(m,history) || case when f ? 'icon' then jsonb_build_object('icon',m.icon,'quickValue',m.quick_value) else '{}'::jsonb end end);
 exception
  when sqlstate 'P0533' then code:=404; result:=jsonb_build_object('error','NOT_FOUND','message','La métrica ya no está disponible.');
  when sqlstate 'P0532' then
   code:=409; result:=jsonb_build_object('error',sqlerrm,'message',case sqlerrm
    when 'SYSTEM_METRIC_IMMUTABLE' then 'El nombre, el tipo y la unidad de esta métrica son fijos.'
    when 'SYSTEM_METRIC_PROTECTED' then 'Las métricas del sistema no se eliminan. Podés archivarlas.'
    when 'METRIC_HAS_HISTORY' then case when op='delete' then 'Esta métrica tiene historial y sólo puede archivarse.'
     else 'Una métrica con historial no puede cambiar de tipo o unidad.' end
    else 'La métrica cambió desde que la abriste. Lo que escribiste sigue acá para revisarlo.' end);
 end;
 update public.mobile_idempotency_keys set state='completed',response_status=code,response_body=result,resource_type='user_metric',resource_id=coalesce(m.id,mid),completed_at=clock_timestamp()
 where user_id=u and operation='metrics.definition.v1' and idempotency_key=k;
 return query select code,result,false;
end;
$$;


revoke all on function ownlevel_private.mobile_mutate_metric_definition(jsonb) from public,anon,authenticated;
grant execute on function ownlevel_private.mobile_mutate_metric_definition(jsonb) to authenticated;
create or replace function public.mobile_mutate_metric_definition(p_intent jsonb)
returns table(response_status smallint,response_body jsonb,replayed boolean)
language sql security invoker set search_path='' as $$
 select * from ownlevel_private.mobile_mutate_metric_definition(p_intent)
$$;
revoke all on function public.mobile_mutate_metric_definition(jsonb) from public,anon;
grant execute on function public.mobile_mutate_metric_definition(jsonb) to authenticated;

-- Existing reorder/CAS/receipts are unchanged; only the privilege boundary moves.
alter function public.mobile_reorder_metric_definitions(jsonb) set schema ownlevel_private;
revoke all on function ownlevel_private.mobile_reorder_metric_definitions(jsonb) from public,anon,authenticated;
grant execute on function ownlevel_private.mobile_reorder_metric_definitions(jsonb) to authenticated;
create function public.mobile_reorder_metric_definitions(p_intent jsonb)
returns table(response_status smallint,response_body jsonb,replayed boolean)
language sql security invoker set search_path='' as $$
 select * from ownlevel_private.mobile_reorder_metric_definitions(p_intent)
$$;
revoke all on function public.mobile_reorder_metric_definitions(jsonb) from public,anon;
grant execute on function public.mobile_reorder_metric_definitions(jsonb) to authenticated;
commit;

