import { getSiteDraft, getHeroPreview } from "@/lib/site";
import { listAdminProducts } from "@/lib/admin-data";
import SiteEditor from "@/components/admin/SiteEditor";
export default async function SitePage() {
  const draft = await getSiteDraft();
  const products = await listAdminProducts();
  return (
    <SiteEditor
      initial={draft}
      products={products}
      heroPreview={await getHeroPreview(draft.heroImage)}
    />
  );
}
