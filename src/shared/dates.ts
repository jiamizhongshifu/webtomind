import dayjs from 'dayjs';
import relativeTime from 'dayjs/plugin/relativeTime';
import 'dayjs/locale/zh-cn';

dayjs.extend(relativeTime);

function normalizeLocale(locale: string): string {
  return locale.toLowerCase().startsWith('zh') ? 'zh-cn' : 'en';
}

/** 统一日期时间展示：YYYY-MM-DD HH:mm，按中英文 locale 处理。 */
export function formatDateTime(
  value: string | Date,
  locale: string
): string {
  const parsed = dayjs(value);
  if (!parsed.isValid()) return String(value);
  return parsed.locale(normalizeLocale(locale)).format('YYYY-MM-DD HH:mm');
}

/** 相对时间：刚刚 / 5 分钟前 / 3 天前。 */
export function formatRelativeTime(
  value: string | Date,
  locale: string
): string {
  const parsed = dayjs(value);
  if (!parsed.isValid()) return String(value);
  return parsed.locale(normalizeLocale(locale)).fromNow();
}
