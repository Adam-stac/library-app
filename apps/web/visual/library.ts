import type { Page } from '@playwright/test'

/*
 * A fixed library for the screenshot and reflow tests: the same books, authors and benefits every run, so a
 * screenshot changes only when the app's look does. The API is answered here in the browser (page.route), so no
 * server or database is needed, and every date is fixed (the tests also fix the clock).
 */

const year = (hijri: number) => ({ hijri, ce: null, approximate: false })

const sciences = [
  ['العقيدة', 'ʿAqīdah'],
  ['التفسير', 'Tafsīr'],
  ['الحديث', 'Ḥadīth'],
  ['مصطلح الحديث', 'Muṣṭalaḥ al-Ḥadīth'],
  ['الفقه', 'Fiqh'],
  ['أصول الفقه', 'Uṣūl al-Fiqh'],
  ['السيرة النبوية', 'Sīrah'],
  ['اللغة العربية', 'Arabic language'],
].map(([nameAr, nameEn], i) => ({ id: `s${i}`, nameAr, nameEn, version: 0 }))

const places = [
  { id: 'p1', nameAr: 'مكة', nameEn: 'Makkah', countryAr: 'السعودية', countryEn: 'Saudi Arabia', shared: true },
  { id: 'p2', nameAr: 'بخارى', nameEn: 'Bukhara', countryAr: 'أوزبكستان', countryEn: 'Uzbekistan', shared: true },
  { id: 'p3', nameAr: 'بغداد', nameEn: 'Baghdad', countryAr: 'العراق', countryEn: 'Iraq', shared: true },
  { id: 'p4', nameAr: 'خرتنك', nameEn: 'Khartank', countryAr: 'أوزبكستان', countryEn: 'Uzbekistan', shared: false },
  { id: 'p5', nameAr: 'دمشق', nameEn: 'Damascus', countryAr: 'سوريا', countryEn: 'Syria', shared: true },
]
const place = { ...places[3], otherNames: ['خَرْتَنْك', 'Khartang'], latitude: 39.7, longitude: 66.98, version: 2 }

const authors = [
  { id: 'a2', nameAr: 'ابن حجر العسقلاني', nameEn: 'Ibn Ḥajar al-ʿAsqalānī', birth: year(773), death: year(852) },
  { id: 'a1', nameAr: 'البخاري', nameEn: 'al-Bukhārī', birth: year(194), death: year(256) },
  { id: 'a3', nameAr: 'النووي', nameEn: 'al-Nawawī', birth: year(631), death: year(676) },
]
const author = {
  ...authors[1],
  fullName: 'محمد بن إسماعيل بن إبراهيم البخاري',
  ism: 'محمد',
  kunya: 'أبو عبد الله',
  laqab: null,
  nisba: 'البخاري الجعفي',
  birthPlace: { id: 'p2', nameAr: 'بخارى', nameEn: 'Bukhara' },
  deathPlace: { id: 'p4', nameAr: 'خرتنك', nameEn: 'Khartank' },
  biography: 'صاحب الجامع الصحيح، رحل في طلب الحديث إلى الحجاز والعراق والشام ومصر.',
  version: 3,
}

const work = (id: string, titleAr: string, titleEn: string, authorIndexes: number[], science: number | null) => ({
  id,
  titleAr,
  titleEn,
  science:
    science === null
      ? null
      : { id: sciences[science].id, nameAr: sciences[science].nameAr, nameEn: sciences[science].nameEn },
  authors: authorIndexes.map((i) => ({ id: authors[i].id, nameAr: authors[i].nameAr, nameEn: authors[i].nameEn })),
})
const works = [
  work('w1', 'صحيح البخاري', 'Ṣaḥīḥ al-Bukhārī', [1], 2),
  work('w2', 'فتح الباري شرح صحيح البخاري', 'Fatḥ al-Bārī', [0], 2),
  work('w3', 'رياض الصالحين', 'Riyāḍ al-Ṣāliḥīn', [2], 2),
  work('w4', 'المجموع شرح المهذب', 'al-Majmūʿ', [2], 4),
  work('w5', 'الأذكار', 'al-Adhkār', [2], null),
  work('w6', 'بلوغ المرام', 'Bulūgh al-Marām', [0], 4),
]

type Bookmark = { volume: number | null; page: number; movedAt: string } | null
const copy = (id: string, w: number, volumes: number, status: string, bookmark: Bookmark) => ({
  id,
  work: works[w],
  title: null,
  volumes,
  purchasedOn: '2024-03-12',
  status,
  bookmark,
})
const editions = [
  copy('e6', 5, 1, 'finished', null),
  copy('e5', 4, 1, 'not_started', null),
  copy('e2', 1, 13, 'reading', { volume: 3, page: 212, movedAt: '2026-10-20T10:00:00Z' }),
  copy('e3', 2, 1, 'reading', { volume: null, page: 45, movedAt: '2026-10-26T10:00:00Z' }),
  copy('e1', 0, 9, 'not_started', null),
  copy('e4', 3, 23, 'not_started', null),
]
const edition = {
  ...editions[2],
  language: 'ar',
  translator: null,
  muhaqqiq: 'محب الدين الخطيب',
  publisher: 'المكتبة السلفية',
  publicationPlace: 'القاهرة',
  published: { hijri: 1380, ce: null },
  editionNumber: 1,
  isbn: '9789953520110',
  legalDeposit: null,
  shelf: 'المكتب، الخزانة ٢',
  notes: 'نسخة السلفية، بترقيم محمد فؤاد عبد الباقي.',
  price: { amount: '450.00', currency: 'SAR' },
  startedOn: '2026-09-01',
  finishedOn: null,
  version: 4,
}

const benefits = [
  {
    id: 'b1',
    text: 'قال ابن حجر: «إنما الأعمال بالنيات» هذا الحديث أحد الأحاديث التي عليها مدار الإسلام.',
    edition: { id: 'e2', title: null, volumes: 13, work: works[1] },
    volume: 1,
    page: 11,
    source: 'app',
    version: 1,
    createdAt: '2026-10-25T10:00:00Z',
  },
  {
    id: 'b2',
    text: 'من فقه الرجل رفقه في معيشته.',
    edition: null,
    volume: null,
    page: null,
    source: 'hasib',
    version: 0,
    createdAt: '2026-10-22T10:00:00Z',
  },
  {
    id: 'b3',
    text: 'The scholars said: knowledge is not memorising much, it is fearing Allah.',
    edition: { id: 'e3', title: null, volumes: 1, work: works[2] },
    volume: null,
    page: 230,
    source: 'app',
    version: 0,
    createdAt: '2026-10-18T10:00:00Z',
  },
]

const home = {
  counts: { books: 124, works: 101, authors: 58, benefits: 37, reading: 3 },
  thisYear: {
    year: 2026,
    started: 9,
    finished: 6,
    spent: [
      { currency: 'SAR', amount: '1840.00' },
      { currency: 'GBP', amount: '96.50' },
    ],
  },
  bySciences: [
    { science: sciences[2], books: 41, percent: 33 },
    { science: sciences[4], books: 28, percent: 23 },
    { science: sciences[1], books: 19, percent: 15 },
    { science: sciences[0], books: 14, percent: 11 },
    { science: sciences[7], books: 12, percent: 10 },
    { science: null, books: 10, percent: 8 },
  ],
  notStarted: [editions[4], editions[5], editions[1]].map((e) => ({
    id: e.id,
    title: null,
    volumes: e.volumes,
    purchasedOn: '2023-11-02',
    startedOn: null,
    work: e.work,
  })),
  quiet: [{ id: 'e6', title: null, volumes: 1, purchasedOn: null, startedOn: '2026-03-14', work: works[5] }],
  recentBookmarks: [editions[2], editions[3]].map((e) => ({
    editionId: e.id,
    work: e.work,
    title: null,
    volumes: e.volumes,
    bookmark: e.bookmark,
  })),
  recentBenefits: benefits.slice(0, 2),
}

const bin = {
  items: [
    {
      id: 'b9',
      kind: 'benefit',
      title: null,
      titleAr: null,
      titleEn: null,
      excerpt: 'العلم قبل القول والعمل، لقول الله تعالى: فاعلم أنه لا إله إلا الله.',
      deletedAt: '2026-10-27T10:00:00Z',
      removedAt: '2026-11-26T10:00:00Z',
    },
    {
      id: 'e9',
      kind: 'book',
      title: null,
      titleAr: 'الموطأ',
      titleEn: 'al-Muwaṭṭaʾ',
      excerpt: null,
      deletedAt: '2026-10-20T10:00:00Z',
      removedAt: '2026-11-19T10:00:00Z',
    },
  ],
  total: 2,
  keptDays: 30,
}

/** The authors timeline: 26 classical authors, one without a date */
const timeline = {
  authors: [
    {
      id: 't0',
      nameAr: 'أبو حنيفة',
      nameEn: 'Abū Ḥanīfa',
      deathHijri: 150,
      deathCe: null,
      approximate: false,
      books: 1,
      works: 1,
      titles: [{ titleAr: 'الفقه الأكبر', titleEn: 'al-Fiqh al-Akbar' }],
      science: { id: 's4', nameAr: 'الفقه', nameEn: 'Fiqh' },
    },
    {
      id: 't1',
      nameAr: 'الشافعي',
      nameEn: 'al-Shāfiʿī',
      deathHijri: 204,
      deathCe: null,
      approximate: false,
      books: 2,
      works: 2,
      titles: [
        { titleAr: 'الرسالة', titleEn: 'al-Risāla' },
        { titleAr: 'الأم', titleEn: 'al-Umm' },
      ],
      science: { id: 's5', nameAr: 'أصول الفقه', nameEn: 'Uṣūl al-fiqh' },
    },
    {
      id: 't2',
      nameAr: 'البخاري',
      nameEn: 'al-Bukhārī',
      deathHijri: 256,
      deathCe: null,
      approximate: false,
      books: 2,
      works: 2,
      titles: [
        { titleAr: 'صحيح البخاري', titleEn: 'Ṣaḥīḥ al-Bukhārī' },
        { titleAr: 'الأدب المفرد', titleEn: 'al-Adab al-Mufrad' },
      ],
      science: { id: 's2', nameAr: 'الحديث', nameEn: 'Ḥadīth' },
    },
    {
      id: 't3',
      nameAr: 'ابن ماجه',
      nameEn: 'Ibn Mājah',
      deathHijri: 273,
      deathCe: null,
      approximate: false,
      books: 1,
      works: 1,
      titles: [{ titleAr: 'سنن ابن ماجه', titleEn: 'Sunan Ibn Mājah' }],
      science: { id: 's2', nameAr: 'الحديث', nameEn: 'Ḥadīth' },
    },
    {
      id: 't4',
      nameAr: 'الترمذي',
      nameEn: 'al-Tirmidhī',
      deathHijri: 279,
      deathCe: null,
      approximate: false,
      books: 2,
      works: 2,
      titles: [
        { titleAr: 'جامع الترمذي', titleEn: 'Jāmiʿ al-Tirmidhī' },
        { titleAr: 'الشمائل المحمدية', titleEn: 'al-Shamāʾil al-Muḥammadiyya' },
      ],
      science: { id: 's2', nameAr: 'الحديث', nameEn: 'Ḥadīth' },
    },
    {
      id: 't5',
      nameAr: 'الطبري',
      nameEn: 'al-Ṭabarī',
      deathHijri: 310,
      deathCe: null,
      approximate: false,
      books: 2,
      works: 2,
      titles: [
        { titleAr: 'جامع البيان', titleEn: 'Jāmiʿ al-Bayān' },
        { titleAr: 'تاريخ الرسل والملوك', titleEn: 'Tārīkh al-Rusul wa-l-Mulūk' },
      ],
      science: { id: 's1', nameAr: 'التفسير', nameEn: 'Tafsīr' },
    },
    {
      id: 't6',
      nameAr: 'الأشعري',
      nameEn: 'al-Ashʿarī',
      deathHijri: 324,
      deathCe: null,
      approximate: false,
      books: 1,
      works: 1,
      titles: [{ titleAr: 'الإبانة', titleEn: 'al-Ibāna' }],
      science: { id: 's0', nameAr: 'العقيدة', nameEn: 'ʿAqīdah' },
    },
    {
      id: 't7',
      nameAr: 'الدارقطني',
      nameEn: 'al-Dāraquṭnī',
      deathHijri: 385,
      deathCe: null,
      approximate: false,
      books: 1,
      works: 1,
      titles: [{ titleAr: 'سنن الدارقطني', titleEn: 'Sunan al-Dāraquṭnī' }],
      science: { id: 's2', nameAr: 'الحديث', nameEn: 'Ḥadīth' },
    },
    {
      id: 't8',
      nameAr: 'البيهقي',
      nameEn: 'al-Bayhaqī',
      deathHijri: 458,
      deathCe: null,
      approximate: false,
      books: 2,
      works: 2,
      titles: [
        { titleAr: 'السنن الكبرى', titleEn: 'al-Sunan al-Kubrā' },
        { titleAr: 'شعب الإيمان', titleEn: 'Shuʿab al-Īmān' },
      ],
      science: { id: 's2', nameAr: 'الحديث', nameEn: 'Ḥadīth' },
    },
    {
      id: 't9',
      nameAr: 'الخطيب البغدادي',
      nameEn: 'al-Khaṭīb al-Baghdādī',
      deathHijri: 463,
      deathCe: null,
      approximate: false,
      books: 1,
      works: 1,
      titles: [{ titleAr: 'تاريخ بغداد', titleEn: 'Tārīkh Baghdād' }],
      science: { id: 's6', nameAr: 'السيرة والتاريخ', nameEn: 'Sīrah and history' },
    },
    {
      id: 't10',
      nameAr: 'الغزالي',
      nameEn: 'al-Ghazālī',
      deathHijri: 505,
      deathCe: null,
      approximate: false,
      books: 2,
      works: 2,
      titles: [
        { titleAr: 'المستصفى', titleEn: 'al-Mustaṣfā' },
        { titleAr: 'إحياء علوم الدين', titleEn: 'Iḥyāʾ ʿUlūm al-Dīn' },
      ],
      science: { id: 's5', nameAr: 'أصول الفقه', nameEn: 'Uṣūl al-fiqh' },
    },
    {
      id: 't11',
      nameAr: 'القاضي عياض',
      nameEn: 'al-Qāḍī ʿIyāḍ',
      deathHijri: 544,
      deathCe: null,
      approximate: false,
      books: 1,
      works: 1,
      titles: [{ titleAr: 'الشفا', titleEn: 'al-Shifā' }],
      science: { id: 's6', nameAr: 'السيرة والتاريخ', nameEn: 'Sīrah and history' },
    },
    {
      id: 't12',
      nameAr: 'ابن قدامة',
      nameEn: 'Ibn Qudāma',
      deathHijri: 620,
      deathCe: null,
      approximate: false,
      books: 2,
      works: 2,
      titles: [
        { titleAr: 'المغني', titleEn: 'al-Mughnī' },
        { titleAr: 'عمدة الفقه', titleEn: 'ʿUmdat al-Fiqh' },
      ],
      science: { id: 's4', nameAr: 'الفقه', nameEn: 'Fiqh' },
    },
    {
      id: 't13',
      nameAr: 'القرطبي',
      nameEn: 'al-Qurṭubī',
      deathHijri: 671,
      deathCe: null,
      approximate: false,
      books: 1,
      works: 1,
      titles: [{ titleAr: 'الجامع لأحكام القرآن', titleEn: 'al-Jāmiʿ li-Aḥkām al-Qurʾān' }],
      science: { id: 's1', nameAr: 'التفسير', nameEn: 'Tafsīr' },
    },
    {
      id: 't14',
      nameAr: 'ابن تيمية',
      nameEn: 'Ibn Taymiyya',
      deathHijri: 728,
      deathCe: null,
      approximate: false,
      books: 2,
      works: 2,
      titles: [
        { titleAr: 'العقيدة الواسطية', titleEn: 'al-ʿAqīda al-Wāsiṭiyya' },
        { titleAr: 'مجموع الفتاوى', titleEn: 'Majmūʿ al-Fatāwā' },
      ],
      science: { id: 's0', nameAr: 'العقيدة', nameEn: 'ʿAqīdah' },
    },
    {
      id: 't15',
      nameAr: 'الذهبي',
      nameEn: 'al-Dhahabī',
      deathHijri: 748,
      deathCe: null,
      approximate: false,
      books: 2,
      works: 2,
      titles: [
        { titleAr: 'سير أعلام النبلاء', titleEn: 'Siyar Aʿlām al-Nubalāʾ' },
        { titleAr: 'ميزان الاعتدال', titleEn: 'Mīzān al-Iʿtidāl' },
      ],
      science: { id: 's3', nameAr: 'مصطلح الحديث', nameEn: 'Muṣṭalaḥ al-ḥadīth' },
    },
    {
      id: 't16',
      nameAr: 'ابن كثير',
      nameEn: 'Ibn Kathīr',
      deathHijri: 774,
      deathCe: null,
      approximate: false,
      books: 2,
      works: 2,
      titles: [
        { titleAr: 'تفسير القرآن العظيم', titleEn: 'Tafsīr al-Qurʾān al-ʿAẓīm' },
        { titleAr: 'البداية والنهاية', titleEn: 'al-Bidāya wa-l-Nihāya' },
      ],
      science: { id: 's1', nameAr: 'التفسير', nameEn: 'Tafsīr' },
    },
    {
      id: 't17',
      nameAr: 'العراقي',
      nameEn: 'al-ʿIrāqī',
      deathHijri: 806,
      deathCe: null,
      approximate: false,
      books: 1,
      works: 1,
      titles: [{ titleAr: 'ألفية العراقي', titleEn: 'Alfiyyat al-ʿIrāqī' }],
      science: { id: 's3', nameAr: 'مصطلح الحديث', nameEn: 'Muṣṭalaḥ al-ḥadīth' },
    },
    {
      id: 't18',
      nameAr: 'ابن حجر العسقلاني',
      nameEn: 'Ibn Ḥajar al-ʿAsqalānī',
      deathHijri: 852,
      deathCe: null,
      approximate: false,
      books: 3,
      works: 3,
      titles: [
        { titleAr: 'فتح الباري', titleEn: 'Fatḥ al-Bārī' },
        { titleAr: 'بلوغ المرام', titleEn: 'Bulūgh al-Marām' },
        { titleAr: 'نخبة الفكر', titleEn: 'Nukhbat al-Fikar' },
      ],
      science: { id: 's2', nameAr: 'الحديث', nameEn: 'Ḥadīth' },
    },
    {
      id: 't19',
      nameAr: 'السخاوي',
      nameEn: 'al-Sakhāwī',
      deathHijri: 902,
      deathCe: null,
      approximate: false,
      books: 1,
      works: 1,
      titles: [{ titleAr: 'فتح المغيث', titleEn: 'Fatḥ al-Mughīth' }],
      science: { id: 's3', nameAr: 'مصطلح الحديث', nameEn: 'Muṣṭalaḥ al-ḥadīth' },
    },
    {
      id: 't20',
      nameAr: 'القسطلاني',
      nameEn: 'al-Qasṭallānī',
      deathHijri: 923,
      deathCe: null,
      approximate: false,
      books: 1,
      works: 1,
      titles: [{ titleAr: 'إرشاد الساري', titleEn: 'Irshād al-Sārī' }],
      science: { id: 's2', nameAr: 'الحديث', nameEn: 'Ḥadīth' },
    },
    {
      id: 't21',
      nameAr: 'علي القاري',
      nameEn: 'ʿAlī al-Qārī',
      deathHijri: 1014,
      deathCe: null,
      approximate: false,
      books: 1,
      works: 1,
      titles: [{ titleAr: 'مرقاة المفاتيح', titleEn: 'Mirqāt al-Mafātīḥ' }],
      science: { id: 's2', nameAr: 'الحديث', nameEn: 'Ḥadīth' },
    },
    {
      id: 't22',
      nameAr: 'ابن عابدين',
      nameEn: 'Ibn ʿĀbidīn',
      deathHijri: 1252,
      deathCe: null,
      approximate: false,
      books: 1,
      works: 1,
      titles: [{ titleAr: 'رد المحتار', titleEn: 'Radd al-Muḥtār' }],
      science: { id: 's4', nameAr: 'الفقه', nameEn: 'Fiqh' },
    },
    {
      id: 't23',
      nameAr: 'المباركفوري',
      nameEn: 'al-Mubārakfūrī',
      deathHijri: 1353,
      deathCe: null,
      approximate: false,
      books: 1,
      works: 1,
      titles: [{ titleAr: 'تحفة الأحوذي', titleEn: 'Tuḥfat al-Aḥwadhī' }],
      science: { id: 's2', nameAr: 'الحديث', nameEn: 'Ḥadīth' },
    },
    {
      id: 't24',
      nameAr: 'الألباني',
      nameEn: 'al-Albānī',
      deathHijri: 1420,
      deathCe: null,
      approximate: false,
      books: 2,
      works: 2,
      titles: [
        { titleAr: 'سلسلة الأحاديث الصحيحة', titleEn: 'Silsilat al-Aḥādīth al-Ṣaḥīḥa' },
        { titleAr: 'صفة صلاة النبي', titleEn: 'Ṣifat Ṣalāt al-Nabī' },
      ],
      science: { id: 's2', nameAr: 'الحديث', nameEn: 'Ḥadīth' },
    },
    {
      id: 't25',
      nameAr: 'ابن عثيمين',
      nameEn: 'Ibn ʿUthaymīn',
      deathHijri: 1421,
      deathCe: null,
      approximate: false,
      books: 1,
      works: 1,
      titles: [{ titleAr: 'الشرح الممتع', titleEn: 'al-Sharḥ al-Mumtiʿ' }],
      science: { id: 's4', nameAr: 'الفقه', nameEn: 'Fiqh' },
    },
  ],
  undated: [{ id: 't99', nameAr: 'مؤلف معاصر', nameEn: null }],
}

/** What the API answers for a GET; null for 204 No Content */
function answer(url: URL): unknown {
  const path = url.pathname
  const page = (items: unknown[], size = 50) => ({ items, page: 0, size, total: items.length })
  if (path === '/api/v1/home') return home
  if (path === '/api/v1/editions') return page(url.searchParams.get('workId') ? editions.slice(2, 3) : editions)
  if (path === '/api/v1/editions/by-isbn') return { items: [] } // no other copy of the ISBN in the field
  if (path.startsWith('/api/v1/editions/')) return edition
  if (path === '/api/v1/works') return page(works.slice(0, 2), 100)
  if (path.startsWith('/api/v1/works/')) return { ...works[1], version: 2 }
  if (path === '/api/v1/benefits') {
    return page(url.searchParams.get('editionId') ? benefits.slice(0, 1) : benefits, 20)
  }
  if (path.startsWith('/api/v1/benefits/')) return benefits[0]
  if (path === '/api/v1/authors') return page(authors)
  if (path.startsWith('/api/v1/authors/')) return author
  if (path === '/api/v1/places') {
    const mine = url.searchParams.get('scope') === 'mine'
    return page(mine ? places.filter((p) => !p.shared) : places)
  }
  if (path.startsWith('/api/v1/places/')) return place
  if (path === '/api/v1/sciences') return { items: sciences, total: sciences.length }
  if (path === '/api/v1/library-settings') return { defaultCurrency: 'SAR' }
  if (path === '/api/v1/bin') return bin
  if (path === '/api/v1/timeline') return timeline
  if (path === '/api/v1/search') {
    return {
      authors: { items: authors.slice(1, 2), total: 1 },
      places: { items: places.slice(1, 2), total: 1 },
      works: { items: works.slice(0, 1), total: 1 },
      editions: { items: [], total: 0 },
      benefits: { items: [], total: 0 },
    }
  }
  return null
}

/**
 * Opens the app as a reader of this library, or signed out, in a language, at a fixed moment (28 October 2026,
 * midday UTC), with the API answered from the library above.
 */
export async function useLibrary(page: Page, { signedIn, language }: { signedIn: boolean; language: 'ar' | 'en' }) {
  await page.clock.setFixedTime(new Date('2026-10-28T12:00:00Z'))
  await page.addInitScript((lang) => localStorage.setItem('language', lang), language)
  await page.route('**/api/**', (route) => {
    const url = new URL(route.request().url())
    if (url.pathname === '/api/v1/auth/me') {
      return signedIn
        ? route.fulfill({ json: { email: 'reader@example.com', language } })
        : route.fulfill({ status: 204 })
    }
    if (route.request().method() !== 'GET') return route.fulfill({ status: 204 })
    const body = answer(url)
    return body === null ? route.fulfill({ status: 204 }) : route.fulfill({ json: body, headers: { ETag: '"1"' } })
  })
}

/** The pages to check: signed out, then the library. Each address has data above to fill it. */
export const PAGES: { name: string; path: string; signedIn: boolean }[] = [
  { name: 'landing', path: '/', signedIn: false },
  { name: 'sign-in', path: '/sign-in', signedIn: false },
  { name: 'register', path: '/register', signedIn: false },
  { name: 'home', path: '/', signedIn: true },
  { name: 'books', path: '/books', signedIn: true },
  { name: 'book', path: '/books/e2', signedIn: true },
  { name: 'book-form', path: '/books/new', signedIn: true },
  { name: 'benefits', path: '/benefits', signedIn: true },
  { name: 'benefit-form', path: '/benefits/new?book=e2', signedIn: true },
  { name: 'authors', path: '/authors', signedIn: true },
  { name: 'timeline', path: '/authors/timeline', signedIn: true },
  { name: 'author', path: '/authors/a1', signedIn: true },
  { name: 'places', path: '/places', signedIn: true },
  { name: 'sciences', path: '/sciences', signedIn: true },
  { name: 'search', path: '/search?q=%D8%A8%D8%AE%D8%A7%D8%B1%D9%8A', signedIn: true },
  { name: 'settings', path: '/settings', signedIn: true },
  { name: 'bin', path: '/bin', signedIn: true },
]

/** More pages checked for reflow only: mostly forms, whose look the screenshots above already cover */
export const MORE_PAGES: { name: string; path: string; signedIn: boolean }[] = [
  { name: 'forgot-password', path: '/forgot-password', signedIn: false },
  { name: 'benefit', path: '/benefits/b1', signedIn: true },
  { name: 'place', path: '/places/p4', signedIn: true },
  { name: 'place-form', path: '/places/new', signedIn: true },
  { name: 'author-form', path: '/authors/new', signedIn: true },
  { name: 'library-settings', path: '/library-settings', signedIn: true },
  { name: 'account', path: '/account', signedIn: true },
  { name: 'change-password', path: '/change-password', signedIn: true },
  { name: 'security', path: '/security', signedIn: true },
  { name: 'two-step-verification', path: '/two-step-verification', signedIn: true },
  { name: 'passkeys', path: '/passkeys', signedIn: true },
  { name: 'not-found', path: '/no-such-page', signedIn: true },
]

/** Waits until the page has drawn what it loaded, in its own fonts */
export async function settled(page: Page) {
  await page.waitForLoadState('networkidle')
  await page.evaluate(() => document.fonts.ready)
  // Placeholders wait a quarter of a second before showing; by now the data is there, so none are left
  await page.waitForFunction(() => document.querySelector('[aria-busy="true"]') === null)
}
