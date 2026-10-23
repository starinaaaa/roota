-- Confirmed packaging: one plate 600 g, two plates 1000 g; every box 25 x 25 x 6 cm.
-- Existing orders retain their frozen packing snapshots.
update public.delivery_packing_rules r set
 weight_g=case when (r.composition->0->>'quantity')::int=1 then 600 else 1000 end,
 length_mm=250,width_mm=250,height_mm=60
from public.categories c
where c.slug='plates' and r.active and jsonb_array_length(r.composition)=1
 and r.composition->0->>'category_id'=c.id::text
 and (r.composition->0->>'quantity')::int in (1,2);

-- Multi-plate orders now use the pair rule and a single-plate remainder.
update public.delivery_packing_rules r set active=false
from public.categories c
where c.slug='plates' and r.active and jsonb_array_length(r.composition)=1
 and r.composition->0->>'category_id'=c.id::text
 and (r.composition->0->>'quantity')::int>2;
