/**
 * Returns an inline style object for a CSS background-image if the user has
 * an uploaded photo, or undefined otherwise (letting the element's existing
 * CSS class handle the gradient placeholder, same as before photos existed).
 * Used everywhere an .avatar/.msg-avatar/.person-avatar/etc element renders
 * a user, so the "real photo vs gradient placeholder" logic lives in one
 * place instead of being re-typed at every call site.
 */
export function photoStyle(user) {
  const url = user?.photos?.[0]?.url
  if (!url) return undefined
  return { backgroundImage: `url(${url})`, backgroundSize: 'cover', backgroundPosition: 'center' }
}
