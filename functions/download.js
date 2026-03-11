export async function onRequestPost(context) {
  const formData = await context.request.formData();

  const email = (formData.get("email") || "").toString().trim().toLowerCase();
  const source = (formData.get("source") || "").toString().trim() || "get-trial";
  const aff = (formData.get("aff") || "").toString().trim() || "";

  if (!email || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) {
    return new Response("Please enter a valid email.", { status: 400 });
  }

  await context.env.DB.prepare(
    `INSERT OR IGNORE INTO downloads (email, created_at, source, aff)
     VALUES (?, datetime('now'), ?, ?)`
  )
    .bind(email, source, aff)
    .run();

  return Response.redirect(new URL("/downloads/", context.request.url).toString(), 302);
}