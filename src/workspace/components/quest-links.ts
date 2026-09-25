export function localizeQuestActionLink(
  actionLink: string,
  locale: string
): string {
  if (!actionLink.startsWith('/')) return actionLink;
  if (actionLink.startsWith('/zh-CN') || actionLink.startsWith('/en-US')) {
    return actionLink;
  }
  return locale === 'en-US' ? `/en-US${actionLink}` : `/zh-CN${actionLink}`;
}
