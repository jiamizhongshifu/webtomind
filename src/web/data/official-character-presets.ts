import characterSoftElf from '../assets/prompt-library/character/character-soft-elf-girl.webp';
import characterCafeServer from '../assets/prompt-library/character/character-retro-cafe-server.webp';
import characterCyberCourier from '../assets/prompt-library/character/character-cyber-courier.webp';
import characterIdolTrainee from '../assets/prompt-library/character/character-idol-trainee.webp';
import characterGothicLibrarian from '../assets/prompt-library/character/character-gothic-librarian.webp';
import characterRefinedModel from '../assets/prompt-library/character/character-refined-model.webp';
import characterBlackHairBoy from '../assets/prompt-library/character/character-black-hair-boy.webp';
import characterMusicProducer from '../assets/prompt-library/character/character-music-producer.webp';
import characterRaincoatCommuter from '../assets/prompt-library/character/character-raincoat-commuter.webp';
import characterVioletAnimeGirl from '../assets/prompt-library/character/character-violet-anime-girl.webp';
import characterArcaneApprentice from '../assets/prompt-library/character/character-arcane-apprentice.webp';
import characterClockworkButler from '../assets/prompt-library/character/character-clockwork-butler.webp';
import characterDesertScout from '../assets/prompt-library/character/character-desert-scout.webp';
import characterLunarEngineer from '../assets/prompt-library/character/character-lunar-engineer.webp';
import characterMarineHealer from '../assets/prompt-library/character/character-marine-healer.webp';
import characterSnowArcher from '../assets/prompt-library/character/character-snow-archer.webp';
import characterStreetSkater from '../assets/prompt-library/character/character-street-skater.webp';
import characterVintageDetective from '../assets/prompt-library/character/character-vintage-detective.webp';
import characterKoreanVlineInfluencer from '../assets/prompt-library/character/character-public-expansion-01.webp';
import characterSeoulStreetwearGirl from '../assets/prompt-library/character/character-public-expansion-02.webp';
import characterElegantOfficeModel from '../assets/prompt-library/character/character-public-expansion-03.webp';
import characterSportyTennisBeauty from '../assets/prompt-library/character/character-public-expansion-06.webp';
import characterRetroHongkongBeauty from '../assets/prompt-library/character/character-public-expansion-08.webp';
import characterBookstoreGentleGirl from '../assets/prompt-library/character/character-public-expansion-12.webp';

export type OfficialCharacterGender = 'female' | 'male' | 'neutral';
export type OfficialCharacterSpecies = 'human' | 'elf' | 'cyborg';

export interface OfficialCharacterPreset {
  id: string;
  name: string;
  style: string;
  styleLabel: string;
  gender: OfficialCharacterGender;
  genderLabel: string;
  species: OfficialCharacterSpecies;
  speciesLabel: string;
  author: string;
  description: string;
  prompt: string;
  imageUrl: string;
}

export const LIKED_OFFICIAL_CHARACTER_STORAGE_KEY =
  'webtomind:create-characters-liked-officials';

export function getOfficialCharacterId(presetId: string): string {
  return `official:${presetId}`;
}

export function readLikedOfficialCharacterIds(): string[] {
  if (typeof window === 'undefined') return [];
  try {
    const parsed = JSON.parse(
      window.localStorage.getItem(LIKED_OFFICIAL_CHARACTER_STORAGE_KEY) || '[]'
    );
    return Array.isArray(parsed)
      ? Array.from(
          new Set(
            parsed.filter((item): item is string => typeof item === 'string')
          )
        )
      : [];
  } catch {
    return [];
  }
}

export function writeLikedOfficialCharacterIds(ids: string[]) {
  if (typeof window === 'undefined') return;
  try {
    window.localStorage.setItem(
      LIKED_OFFICIAL_CHARACTER_STORAGE_KEY,
      JSON.stringify(Array.from(new Set(ids.filter(Boolean))))
    );
  } catch {
    // Likes are only a local discovery affordance for now.
  }
}

export const OFFICIAL_CHARACTER_PRESETS: OfficialCharacterPreset[] = [
  {
    id: 'korean-vline-influencer',
    name: 'Korean V-line Influencer',
    style: 'fashion',
    styleLabel: '时尚',
    gender: 'female',
    genderLabel: '女性',
    species: 'human',
    speciesLabel: '人类',
    author: 'WebToMind',
    description:
      '韩系瓜子脸辣妹，覆盖热门写真案例里常见的精致脸型和社媒时尚气质。',
    prompt:
      '韩系瓜子脸成人时尚博主人设，长黑发，精致小脸和清晰下颌线，干净水光底妆，眼妆柔和但有存在感，气质自信、时髦、轻微冷感。穿简洁黑白时装或都市约会造型，背景为浅灰棚拍或首尔公寓自然光，真实高级写真质感，保持瓜子脸、韩系妆容、长黑发和社媒时尚气质稳定，非低俗、非露骨。',
    imageUrl: characterKoreanVlineInfluencer
  },
  {
    id: 'seoul-streetwear-girl',
    name: 'Seoul Streetwear Girl',
    style: 'street',
    styleLabel: '街头',
    gender: 'female',
    genderLabel: '女性',
    species: 'human',
    speciesLabel: '人类',
    author: 'WebToMind',
    description: '首尔街头酷感女孩，适合黑色系穿搭、耳机、夜街和潮流封面。',
    prompt:
      '首尔街头酷感女孩人设，成人女性，黑色针织帽，长发，佩戴银色耳机，眼神冷静有距离感，穿黑色机能外套与层次内搭。背景是混凝土街角、地铁口或夜色街区，低饱和城市光影，真实潮流写真，保持黑帽、耳机、黑色街头穿搭和酷感气质稳定。',
    imageUrl: characterSeoulStreetwearGirl
  },
  {
    id: 'elegant-office-model',
    name: 'Elegant Office Model',
    style: 'business',
    styleLabel: '商务',
    gender: 'female',
    genderLabel: '女性',
    species: 'human',
    speciesLabel: '人类',
    author: 'WebToMind',
    description: '知性通勤模特，适合职场写真、知识型 IP 和商业头像。',
    prompt:
      '知性通勤模特人设，成人女性，黑发低盘或利落中分，五官干净，神情冷静专业，穿黑色西装外套、白衬衫和极简耳饰。背景为现代办公室、会议室玻璃或浅灰棚拍，柔和主光，商业肖像摄影质感，保持通勤西装、清冷知性气质和专业身份稳定。',
    imageUrl: characterElegantOfficeModel
  },
  {
    id: 'sporty-tennis-beauty',
    name: 'Sporty Tennis Beauty',
    style: 'sport',
    styleLabel: '运动',
    gender: 'female',
    genderLabel: '女性',
    species: 'human',
    speciesLabel: '人类',
    author: 'WebToMind',
    description: '网球运动系美人，适合清爽运动写真和夏日户外案例。',
    prompt:
      '网球运动系美人人设，成人女性，高马尾，白色遮阳帽，清爽自然妆容，穿得体网球运动上装，手持球拍，气质明亮健康。背景为绿色网球场、阳光和浅景深，真实运动写真，保持高马尾、遮阳帽、球拍和清爽运动气质稳定。',
    imageUrl: characterSportyTennisBeauty
  },
  {
    id: 'retro-hongkong-beauty',
    name: 'Retro Hong Kong Beauty',
    style: 'retro',
    styleLabel: '复古',
    gender: 'female',
    genderLabel: '女性',
    species: 'human',
    speciesLabel: '人类',
    author: 'WebToMind',
    description: '复古港风美人，适合红唇卷发、胶片感和年代海报。',
    prompt:
      '复古港风美人人设，成人女性，黑色短卷发，红唇，精致眼线，轮廓清晰，穿典雅复古裙装或改良旗袍。背景为暖色室内、旧式餐厅或夜色街灯，胶片摄影质感，保持红唇、卷发、港风妆容和复古电影气质稳定。',
    imageUrl: characterRetroHongkongBeauty
  },
  {
    id: 'bookstore-gentle-girl',
    name: 'Bookstore Gentle Girl',
    style: 'daily',
    styleLabel: '日常',
    gender: 'female',
    genderLabel: '女性',
    species: 'human',
    speciesLabel: '人类',
    author: 'WebToMind',
    description: '书店温柔女孩，适合读书氛围、生活方式和清新账号封面。',
    prompt:
      '书店温柔女孩人设，成人女性，棕黑长发，柔和眼神，穿奶油色毛衣，手持书本，气质安静亲近。背景是书店书架、暖色灯光和浅景深，生活方式写真，保持毛衣、书本、温柔眼神和书店氛围稳定。',
    imageUrl: characterBookstoreGentleGirl
  },
  {
    id: 'soft-elf-girl',
    name: 'Soft Elf Girl',
    style: 'fantasy',
    styleLabel: '幻想',
    gender: 'female',
    genderLabel: '女性',
    species: 'elf',
    speciesLabel: '精灵',
    author: 'WebToMind',
    description: '柔和精灵少女，适合幻想人像、角色设定和系列封面。',
    prompt:
      '柔和精灵少女角色设定，浅金色长发，细微尖耳，浅绿色眼睛，脸型圆润柔和，细腻透明的浅色肌肤，温柔安静的神情，穿着轻薄的森林系白色长裙，点缀银色发饰与微光花瓣。背景是清晨森林与柔和逆光，浅景深，梦幻幻想人像，干净构图，高级插画质感，保持浅金发、尖耳、绿眼和森林治愈气质稳定。',
    imageUrl: characterSoftElf
  },
  {
    id: 'retro-cafe-server',
    name: 'Retro Cafe Server',
    style: 'daily',
    styleLabel: '日常',
    gender: 'female',
    genderLabel: '女性',
    species: 'human',
    speciesLabel: '人类',
    author: 'WebToMind',
    description: '复古咖啡店服务生，适合生活方式、门店海报和社媒封面。',
    prompt:
      '复古咖啡店服务生角色设定，暖棕色短卷发，轻微雀斑，圆眼睛，亲切明亮的脸型，清爽自然妆容，穿着奶油色衬衫、深色围裙与复古领结，气质温暖克制。场景是暖色木质咖啡馆吧台，吊灯柔光，浅景深，胶片感生活方式摄影，适合门店海报和社交媒体封面，保持棕色短卷发、雀斑、围裙和咖啡店身份识别一致。',
    imageUrl: characterCafeServer
  },
  {
    id: 'cyber-courier',
    name: 'Cyber Courier',
    style: 'sci-fi',
    styleLabel: '科幻',
    gender: 'female',
    genderLabel: '女性',
    species: 'cyborg',
    speciesLabel: '半机械',
    author: 'WebToMind',
    description: '赛博快递员，适合科幻海报、游戏角色和城市夜景。',
    prompt:
      '赛博快递员角色设定，青绿色挑染短发，偏深肤色，单侧机械义眼，冷静锐利的眼神，轻量机能夹克，半机械义体细节，胸前有微光编号铭牌，背着城市配送装备。背景是雨夜霓虹街区和高楼屏幕，蓝紫色科幻光影，电影级低角度构图，适合游戏角色海报，保持青绿色挑染、机械义眼、装备和配色稳定。',
    imageUrl: characterCyberCourier
  },
  {
    id: 'idol-trainee',
    name: 'Idol Trainee',
    style: 'idol',
    styleLabel: '偶像',
    gender: 'female',
    genderLabel: '女性',
    species: 'human',
    speciesLabel: '人类',
    author: 'WebToMind',
    description: '练习生风格角色，适合舞台照、写真和粉丝活动视觉。',
    prompt:
      '偶像练习生角色设定，粉色双马尾，杏仁眼，脸型小巧，清透妆容，穿白色衬衫和学院风背心，银色耳饰，表情专注但带轻微笑意。舞台后台或练习室环境，柔和聚光灯和浅色背景，干净青春写真质感，适合粉丝活动视觉，保持粉色双马尾、杏仁眼、学院服装和青春气质一致。',
    imageUrl: characterIdolTrainee
  },
  {
    id: 'gothic-librarian',
    name: 'Gothic Librarian',
    style: 'gothic',
    styleLabel: '哥特',
    gender: 'female',
    genderLabel: '女性',
    species: 'human',
    speciesLabel: '人类',
    author: 'WebToMind',
    description: '哥特图书管理员，适合暗调故事、书店视觉和角色海报。',
    prompt:
      '哥特图书管理员角色设定，银灰长发，冷白肤色，细长眼型，圆框眼镜，冷静聪慧的表情，穿黑色蕾丝高领上衣与复古长裙，佩戴银色胸针。背景是暗色古典图书馆，木质书架、台灯暖光和尘埃光束，电影级暗调故事感，适合书店视觉和角色海报，保持银灰长发、圆框眼镜、黑色蕾丝服装和神秘气质稳定。',
    imageUrl: characterGothicLibrarian
  },
  {
    id: 'refined-model',
    name: 'Refined Model',
    style: 'fashion',
    styleLabel: '时装',
    gender: 'female',
    genderLabel: '女性',
    species: 'human',
    speciesLabel: '人类',
    author: 'WebToMind',
    description: '高级时装模特，适合商业写真、穿搭和品牌大片。',
    prompt:
      '高级时装模特角色设定，深棕肤色，极短黑发，颧骨清晰，长颈肩线，高级冷感表情，穿剪裁干净的黑色西装外套或极简时装，银色耳饰点缀。背景是浅灰棚拍或现代建筑内景，柔和主光和清晰轮廓光，商业时装大片质感，适合品牌视觉和穿搭海报，保持深棕肤色、极短发、清晰骨相和高级气质稳定。',
    imageUrl: characterRefinedModel
  },
  {
    id: 'black-hair-boy',
    name: 'Black Hair Boy',
    style: 'anime',
    styleLabel: '动漫',
    gender: 'male',
    genderLabel: '男性',
    species: 'human',
    speciesLabel: '人类',
    author: 'WebToMind',
    description: '黑发少年主角，适合青春故事、轻小说封面和校园角色设定。',
    prompt:
      '黑发少年主角角色设定，黑色碎发，眉眼清秀，清澈但克制的眼神，五官干净，脸型偏瘦，穿简洁白衬衫、深色外套或学院风制服，气质安静敏感。背景是黄昏教室、城市天台或电车站台，柔和逆光，轻小说插画质感，干净构图，适合青春故事封面和校园角色设定，保持黑色碎发、清秀眉眼、瘦脸和少年感稳定。',
    imageUrl: characterBlackHairBoy
  },
  {
    id: 'music-producer',
    name: 'Music Producer',
    style: 'music',
    styleLabel: '音乐',
    gender: 'neutral',
    genderLabel: '中性',
    species: 'human',
    speciesLabel: '人类',
    author: 'WebToMind',
    description: '独立音乐制作人，适合专辑视觉、直播封面和潮流海报。',
    prompt:
      '独立音乐制作人角色设定，中性潮流气质，铂金短发，宽眉和直线型脸部轮廓，佩戴监听耳机与银色耳饰，穿黑色机能外套、宽松内搭和简洁项链，神情专注冷静。背景是夜间录音棚、合成器、声卡、显示器波形和低照度彩色氛围灯，电影感棚拍，适合专辑视觉、直播封面和潮流海报，保持铂金短发、耳机、服装层次和音乐人身份识别稳定。',
    imageUrl: characterMusicProducer
  },
  {
    id: 'raincoat-commuter',
    name: 'Raincoat Commuter',
    style: 'daily',
    styleLabel: '日常',
    gender: 'female',
    genderLabel: '女性',
    species: 'human',
    speciesLabel: '人类',
    author: 'WebToMind',
    description: '雨衣通勤者，适合城市生活方式、剧情分镜和氛围海报。',
    prompt:
      '雨衣通勤者角色设定，橙红色齐耳短发，圆脸，清淡妆容，穿半透明浅色雨衣、简洁衬衫和通勤包，神情平静带一点疲惫。背景是雨夜公交站、湿润街面、便利店灯光和远处车灯反射，真实城市生活方式摄影，柔和冷暖对比，适合剧情分镜、城市海报和社媒封面，保持橙红短发、圆脸、雨衣、通勤包和雨夜气质稳定。',
    imageUrl: characterRaincoatCommuter
  },
  {
    id: 'violet-anime-girl',
    name: 'Violet Anime Girl',
    style: 'anime',
    styleLabel: '动漫',
    gender: 'female',
    genderLabel: '女性',
    species: 'human',
    speciesLabel: '人类',
    author: 'WebToMind',
    description: '紫调动漫少女，适合头像、角色立绘和梦幻社媒视觉。',
    prompt:
      '紫调动漫少女角色设定，紫色双丸子头，明亮紫色大眼睛，精致二次元五官，脸型小巧，穿浅色学院风上衣和紫色点缀配饰，表情温柔但有一点神秘。背景是夜色花园、星光窗边或梦幻室内，紫蓝色柔光、细腻高光和干净浅景深，适合头像、角色立绘和梦幻社媒视觉，保持紫色双丸子头、大眼睛、服装配色和温柔神秘气质稳定。',
    imageUrl: characterVioletAnimeGirl
  },
  {
    id: 'arcane-apprentice',
    name: 'Arcane Apprentice',
    style: 'fantasy',
    styleLabel: '幻想',
    gender: 'female',
    genderLabel: '女性',
    species: 'human',
    speciesLabel: '人类',
    author: 'WebToMind',
    description: '魔法学徒，适合学院奇幻、魔法研究和轻冒险角色设定。',
    prompt:
      '魔法学徒角色设定，青绿色短发，五官清秀但带一点倔强，眼神专注好奇，穿深蓝绿色宽大斗篷、学院制服和金色扣饰，身边漂浮手写咒文纸与星象笔记。背景是魔法书房、木质书桌、烛光和深色帷幕，高级动漫写实插画质感，适合学院奇幻和魔法研究主题，保持青绿短发、宽大斗篷、咒文纸和学徒气质稳定。',
    imageUrl: characterArcaneApprentice
  },
  {
    id: 'clockwork-butler',
    name: 'Clockwork Butler',
    style: 'steampunk',
    styleLabel: '蒸汽朋克',
    gender: 'male',
    genderLabel: '男性',
    species: 'cyborg',
    speciesLabel: '半机械',
    author: 'WebToMind',
    description: '发条管家，适合蒸汽朋克、古典宅邸和机械幻想设定。',
    prompt:
      '发条管家角色设定，银灰色背头，轮廓硬朗，冷静克制的蓝灰色眼睛，穿黑色定制马甲、白衬衫和复古领结，一侧手臂带精密黄铜机械结构，胸前有圆形齿轮核心装饰。背景是维多利亚式书房、木质书架和黄铜仪器，蒸汽朋克高级角色海报质感，保持银灰背头、机械手、管家服和沉着气质稳定。',
    imageUrl: characterClockworkButler
  },
  {
    id: 'desert-scout',
    name: 'Desert Scout',
    style: 'adventure',
    styleLabel: '冒险',
    gender: 'female',
    genderLabel: '女性',
    species: 'human',
    speciesLabel: '人类',
    author: 'WebToMind',
    description: '沙漠斥候，适合冒险故事、荒漠旅途和开放世界角色。',
    prompt:
      '沙漠斥候角色设定，健康小麦肤色，短深棕发，脸上有细微雀斑和风沙痕迹，眼神警觉坚定，穿浅色防晒围巾、皮革背带、轻量探险服和旅行装备。背景是峡谷、沙丘和暖色日光，电影感荒漠冒险人像，适合开放世界角色和旅途海报，保持短深棕发、小麦肤色、围巾、背带和斥候身份稳定。',
    imageUrl: characterDesertScout
  },
  {
    id: 'lunar-engineer',
    name: 'Lunar Engineer',
    style: 'sci-fi',
    styleLabel: '科幻',
    gender: 'female',
    genderLabel: '女性',
    species: 'human',
    speciesLabel: '人类',
    author: 'WebToMind',
    description: '月面工程师，适合硬科幻、空间站和未来职业视觉。',
    prompt:
      '月面工程师角色设定，银蓝色短发，清澈蓝眼，脸型利落，表情务实冷静，穿白色轻量宇航工程服、蓝色技术接口和透明头盔结构，肩部有圆形设备徽章。背景是月面基地舷窗、星空和冷色仪表光，干净科幻职业海报质感，适合空间站与未来工程主题，保持银蓝短发、白色工程服、头盔和月面基地身份稳定。',
    imageUrl: characterLunarEngineer
  },
  {
    id: 'marine-healer',
    name: 'Marine Healer',
    style: 'healer',
    styleLabel: '治愈',
    gender: 'female',
    genderLabel: '女性',
    species: 'human',
    speciesLabel: '人类',
    author: 'WebToMind',
    description: '海滨治愈师，适合治愈系幻想、诊所视觉和温柔角色设定。',
    prompt:
      '海滨治愈师角色设定，深蓝长发，柔和褐色肌肤，蓝绿色眼睛，佩戴海星与海玻璃发饰，神情安静可靠，穿白蓝色轻薄治愈师外套和珍珠耳饰。背景是海边诊所、明亮窗光、远处海面和柔和医疗器具，治愈系幻想写实插画质感，保持深蓝长发、海玻璃发饰、白蓝外套和温柔医者气质稳定。',
    imageUrl: characterMarineHealer
  },
  {
    id: 'snow-archer',
    name: 'Snow Archer',
    style: 'fantasy',
    styleLabel: '幻想',
    gender: 'female',
    genderLabel: '女性',
    species: 'human',
    speciesLabel: '人类',
    author: 'WebToMind',
    description: '雪原弓手，适合冰雪幻想、狩猎故事和冒险海报。',
    prompt:
      '雪原弓手角色设定，白金色长辫，冷白肤色，冰蓝眼睛，五官清冷锐利，穿灰蓝色皮甲、毛领冬季斗篷和皮革护腕，手持长弓，神情专注。背景是雪松森林、飘雪和冷色自然光，电影感冰雪幻想角色海报，适合狩猎与边境冒险主题，保持白金长辫、冰蓝眼、毛领斗篷、长弓和冷静气质稳定。',
    imageUrl: characterSnowArcher
  },
  {
    id: 'street-skater',
    name: 'Street Skater',
    style: 'street',
    styleLabel: '街头',
    gender: 'female',
    genderLabel: '女性',
    species: 'human',
    speciesLabel: '人类',
    author: 'WebToMind',
    description: '街头滑手，适合潮流海报、城市青春和运动社媒视觉。',
    prompt:
      '街头滑手角色设定，暖橄榄肤色，短卷发，脸上有雀斑，眼神明亮自信，穿蓝色宽松运动外套、橙红色内搭、宽松长裤和滑板鞋，抱着或踩着滑板。背景是城市涂鸦墙、傍晚街区和运动场地灯光，潮流运动插画质感，适合街头青春和社媒视觉，保持短卷发、雀斑、蓝橙外套、滑板和活力气质稳定。',
    imageUrl: characterStreetSkater
  },
  {
    id: 'vintage-detective',
    name: 'Vintage Detective',
    style: 'noir',
    styleLabel: '黑色电影',
    gender: 'female',
    genderLabel: '女性',
    species: 'human',
    speciesLabel: '人类',
    author: 'WebToMind',
    description: '复古侦探，适合悬疑故事、黑色电影和剧情海报。',
    prompt:
      '复古侦探角色设定，成熟女性，赤褐色波浪短发，轮廓分明，眼神敏锐沉着，穿卡其色风衣、深色衬衫和宽檐帽，佩戴细项链或旧式相机。背景是百叶窗光影、雨夜办公室、桌灯和旧档案，黑色电影悬疑海报质感，适合侦探故事和剧情视觉，保持赤褐波浪短发、风衣、宽檐帽和冷静观察者气质稳定。',
    imageUrl: characterVintageDetective
  }
];
