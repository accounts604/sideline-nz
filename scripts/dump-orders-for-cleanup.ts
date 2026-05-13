import "dotenv/config";
import postgres from "postgres";

async function main() {
  const sql = postgres(process.env.DATABASE_URL!, { ssl: "require", max: 1 });
  const rows = await sql`
    SELECT
      o.po_reference, o.account_name, o.customer_name, o.customer_email,
      o.subtotal, o.ghl_opportunity_id, o.pipeline_stage, o.mockup_url,
      COALESCE(json_agg(json_build_object(
        'product', oi.product_name, 'qty', oi.quantity
      )) FILTER (WHERE oi.id IS NOT NULL), '[]'::json) AS items
    FROM orders o
    LEFT JOIN order_items oi ON oi.order_id = o.id
    WHERE o.po_reference IS NOT NULL
    GROUP BY o.id`;
  console.log(JSON.stringify(rows));
  await sql.end();
}
main().catch(e => { console.error(e); process.exit(1); });
