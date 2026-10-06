// 单一语言的全部命名空间。由 src/i18n/index.ts 按需动态加载，
// 让每个访客只下载当前语言的文案。
import auth from './auth.json';
import boards from './boards.json';
import common from './common.json';
import floatingCard from './floatingCard.json';
import home from './home.json';
import imageCreate from './imageCreate.json';
import popup from './popup.json';
import settings from './settings.json';
import sidepanel from './sidepanel.json';
import themeCard from './themeCard.json';
import workspace from './workspace.json';

const resources = {
  common,
  home,
  auth,
  workspace,
  popup,
  floatingCard,
  settings,
  boards,
  sidepanel,
  imageCreate,
  themeCard
};

export default resources;
