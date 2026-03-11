export async function onRequest(context) {

  const { results } = await context.env.DB
    .prepare("SELECT email, created_at, source, aff FROM downloads ORDER BY id DESC")
    .all();

  let csv = "email,created_at,source,aff\n";

  for (const row of results) {
    csv += `${row.email},${row.created_at},${row.source || ""},${row.aff || ""}\n`;
  }

  return new Response(csv, {
    headers: {
      "Content-Type": "text/csv",
      "Content-Disposition": "attachment; filename=firecull_leads.csv"
    }
  });
}