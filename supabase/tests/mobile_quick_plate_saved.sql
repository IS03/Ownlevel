-- Rollback-only regression for mobile_quick_plate_saved_expand: saved meals inside a plate. Synthetic user and data only.
begin;
insert into auth.users(id,email) values ('95000000-0000-4000-8000-000000000001','nutrition-plate-saved@example.invalid');
select set_config('request.jwt.claims','{"sub":"95000000-0000-4000-8000-000000000001","role":"authenticated"}',true);
set local role authenticated;
do $$
declare bread public.foods; manual public.saved_meals; combo public.saved_meals; items jsonb; sel jsonb; p jsonb; r record; s public.saved_meals;
 v_manual text; v_combo text;
begin
 insert into public.foods(user_id,name,serving_quantity,serving_unit,calories,protein_g,carbs_g,fat_g)
 values(auth.uid(),'Pan lactal',1,'rebanada',65.5,2.2,12,0.8) returning * into bread;
 -- A manual saved meal (totals only, protein unknown) and a composite one (two ingredients).
 insert into public.saved_meals(user_id,name,template_type,calories,protein_g,carbs_g,fat_g) values(auth.uid(),'Yogur con granola','manual',180,null,25,4) returning * into manual;
 insert into public.saved_meals(user_id,name,template_type,calories,protein_g,carbs_g,fat_g) values(auth.uid(),'Tostado','composite',300,15,30,12) returning * into combo;
 insert into public.saved_meal_items(saved_meal_id,user_id,label,quantity,unit,base_quantity,base_calories,base_protein_g,base_carbs_g,base_fat_g,position)
 values(combo.id,auth.uid(),'Pan',2,'rebanada',1,65,2,12,1,0),(combo.id,auth.uid(),'Queso',30,'g',100,300,20,1,25,1);
 select * into combo from public.saved_meals where id=combo.id;
 select jsonb_agg(to_jsonb(i) order by i.position,i.id) into items from public.saved_meal_items i where i.saved_meal_id=combo.id;
 v_manual:=public.mobile_quick_source_version(jsonb_build_object('saved',to_jsonb(manual),'items','[]'::jsonb));
 v_combo:=public.mobile_quick_source_version(jsonb_build_object('saved',to_jsonb(combo),'items',items));

 sel:=jsonb_build_object('date','2026-11-21','source',jsonb_build_object('kind','plate','title','Merienda','saveToLibrary',false),'quantities',jsonb_build_array(
  jsonb_build_object('itemId',bread.id,'quantity',1,'version',public.mobile_quick_source_version(to_jsonb(bread))),
  jsonb_build_object('kind','saved','itemId',manual.id,'quantity',2,'version',v_manual),
  jsonb_build_object('kind','saved','itemId',combo.id,'quantity',0.5,'version',v_combo)));
 p:=public.mobile_resolve_quick_occurrence(sel,false);
 -- 66 (bread) + 2 × 180 + ½ × (130 + 90) = 536 kcal; the manual meal's unknown protein leaves the plate protein unknown.
 if (p->'snapshot'->>'calories')::int<>536 or p->'snapshot'->'proteinG'<>'null'::jsonb or (p->'snapshot'->>'carbsG')::numeric<>74.15
  or p->'items'->1->>'unit'<>'porción' or p->'items'->1->>'kind'<>'saved' or p->'items'->2->>'calories'<>'110' then raise exception 'saved preview %',p; end if;
 if p->'snapshot'->>'description'<>'1 REBANADA PAN LACTAL · 2 PORCIÓN YOGUR CON GRANOLA · 0,5 PORCIÓN TOSTADO' then raise exception 'description %',p->'snapshot'->>'description'; end if;

 -- The saved meal edited since it was seen: changed, nothing registered.
 select * into r from public.mobile_preview_quick_meal(jsonb_set(sel,'{quantities,2,version}',to_jsonb(repeat('a',64))));
 if r.response_status<>409 or r.response_body->>'error'<>'QUICK_SOURCE_CHANGED' then raise exception 'cas %',row_to_json(r); end if;
 -- Another kind than «saved» is not a thing.
 begin perform public.mobile_normalize_quick_selection(jsonb_set(sel,'{quantities,1,kind}','"meal"')); raise exception 'unknown kind accepted';
 exception when sqlstate '22023' then null; end;

 -- Registered and saved for later: the saved ingredient keeps no food provenance; the food keeps its own.
 select * into r from public.mobile_confirm_quick_meal(jsonb_set(sel,'{source,saveToLibrary}','true')||jsonb_build_object('operation','register','idempotencyKey','plate-saved:1'));
 if r.response_status<>201 then raise exception 'register %',row_to_json(r); end if;
 select * into s from public.saved_meals where user_id=auth.uid() and name='MERIENDA';
 if (select source_food_id from public.saved_meal_items where saved_meal_id=s.id and position=0)<>bread.id
  or (select source_food_id from public.saved_meal_items where saved_meal_id=s.id and position=1) is not null
  or (select count(*) from public.saved_meal_items where saved_meal_id=s.id)<>3 then raise exception 'saved provenance'; end if;

 -- A plate of foods only keeps its exact normalized shape (same request hash as before this EXPAND).
 if public.mobile_normalize_quick_selection(jsonb_set(sel,'{quantities}',jsonb_build_array(sel->'quantities'->0)))->'quantities'
  <>jsonb_build_array(jsonb_build_object('itemId',bread.id,'quantity',1.00::numeric(12,2),'version',public.mobile_quick_source_version(to_jsonb(bread)))) then raise exception 'food shape changed'; end if;
end $$;
rollback;
