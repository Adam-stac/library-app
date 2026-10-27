/** A work and a copy of it, as the API sends them, for the book pages' tests. */
export const WORK = {
  id: 'w1',
  titleAr: 'صحيح البخاري',
  titleEn: 'Sahih al-Bukhari',
  science: { id: 's1', nameAr: 'الحديث', nameEn: 'Hadith' },
  authors: [{ id: 'a1', nameAr: 'البخاري', nameEn: 'al-Bukhari' }],
}

export const EDITION = {
  id: 'e1',
  work: WORK,
  title: null,
  language: 'ar',
  translator: null,
  muhaqqiq: 'محمد زهير الناصر',
  publisher: 'دار طوق النجاة',
  publicationPlace: 'بيروت',
  published: { hijri: 1422, ce: null },
  editionNumber: 1,
  volumes: 9,
  isbn: null,
  legalDeposit: null,
  shelf: 'Study, case 2',
  notes: null,
  purchasedOn: '2024-03-12',
  price: { amount: '95.50', currency: 'GBP' },
  startedOn: null,
  finishedOn: null,
  status: 'not_started',
  bookmark: null,
  version: 4,
}
