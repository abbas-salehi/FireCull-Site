export async function onRequestPost(context) {

  const formData = await context.request.formData()
  const email = formData.get("email")

  if (!email) {
    return new Response("Email required", { status: 400 })
  }

  console.log("New download email:", email)

  return Response.redirect(
    new URL("/downloads/", context.request.url),
    302
  )
}