-- Synced from production: public (anon + authenticated) read access to catalogue product images.
drop policy if exists "Public can read catalogue product images" on storage.objects;
create policy "Public can read catalogue product images"
on storage.objects for select to anon, authenticated
using (bucket_id = 'product-images');
