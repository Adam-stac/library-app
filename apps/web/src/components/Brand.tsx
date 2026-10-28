import { useTranslation } from 'react-i18next'
import { Link } from 'react-router'

/** خِزانة in Amiri Bold, a classical naskh (SIL Open Font License), drawn as a shape by scripts/make-mark.py */
const MARK_VIEW_BOX = '-6 -729 1643 1255'
const MARK_PATH =
  'M259 -464Q282 -494 287 -437L316 -197Q327 -104 379 -105Q403 -105 412 -83Q421 -59 410 -22Q399 15 379 15Q317 15 291 -17Q266 -48 255 -126Q217 -69 202 -62Q188 -55 151 -58Q103 -61 69 -83Q47 -97 50 -126Q53 -155 72 -190Q82 -208 90.0 -221.0Q98 -234 104 -241Q152 -292 225 -333Q217 -412 229 -427ZM234 -261Q158 -237 130 -197Q126 -191 133 -187Q183 -166 245 -183Q243 -199 240.0 -218.5Q237 -238 234 -261ZM169 -622Q175 -630 186 -627Q206 -620 225.0 -609.0Q244 -598 260 -584Q268 -576 263 -566L215 -490Q207 -479 197 -488Q193 -492 179.5 -500.5Q166 -509 144 -522L111 -468Q104 -458 93 -466Q88 -470 69.5 -481.0Q51 -492 20 -511Q9 -517 17 -528L65 -600Q71 -608 82 -605Q112 -595 138 -576ZM430 -213 459 -275Q474 -308 485 -288Q534 -205 508 -94Q483 15 379 15Q359 15 350 -19Q346 -36 344.0 -49.5Q342 -63 342 -73Q342 -93 363 -102Q371 -105 379 -105Q435 -104 463 -128Q457 -155 440 -173Q421 -194 430 -213ZM442 -502Q448 -510 459 -507Q479 -500 497.5 -489.0Q516 -478 532 -464Q540 -456 535 -446L487 -370Q480 -360 469 -368Q459 -376 397 -413Q386 -420 393 -430ZM668 -692Q688 -735 694 -672L718 -428Q748 -100 704 -15Q694 3 685 0Q675 -3 676 -48Q677 -86 668.0 -173.5Q659 -261 641 -396L620 -562Q617 -583 626 -603ZM1057 -114Q1068 -134 1088 -125Q1103 -114 1113 -90Q1124 -65 1120 -44Q1094 87 1040 153Q970 235 876 245Q831 251 696 142Q685 133 694 119Q703 106 721 118Q765 149 835 152Q859 153 914 126Q941 112 964.5 97.5Q988 83 1008 66Q1047 33 1078 -23Q1077 -27 1047 -43Q1026 -55 1036 -73ZM936 -445Q942 -453 953 -450Q973 -443 991.5 -432.0Q1010 -421 1026 -407Q1034 -399 1029 -389L981 -313Q974 -303 963 -311Q953 -319 891 -356Q880 -363 887 -373ZM1462 310Q1474 302 1486 305Q1496 308 1490 329L1481 361Q1476 376 1456 389L1261 502Q1254 506 1248 506Q1235 505 1233 486V469Q1235 453 1254 440ZM1031 -196Q1055 -260 1078 -281Q1102 -303 1152 -312Q1203 -321 1280 -275Q1305 -261 1338.0 -246.0Q1371 -231 1413 -216Q1455 -201 1499.0 -193.0Q1543 -185 1590 -184Q1625 -182 1615 -156Q1607 -133 1598.5 -113.5Q1590 -94 1580 -79Q1571 -64 1546 -73Q1524 -81 1458 -92Q1356 -109 1110 -38Q1095 -33 1087 -41Q1078 -50 1058 -86Q1041 -115 1071 -124Q1118 -140 1166.5 -150.5Q1215 -161 1265 -167Q1229 -190 1172 -191Q1159 -192 1129.5 -186.5Q1100 -181 1054 -170Q1018 -161 1031 -196ZM1409 -536Q1415 -544 1426 -541Q1446 -534 1464.5 -523.0Q1483 -512 1499 -498Q1507 -490 1502 -480L1454 -404Q1447 -394 1436 -402Q1426 -410 1364 -447Q1353 -454 1360 -464Z'

/** The خِزانة mark on its own, in the theme's accent colour (decorative: the text around it names the app) */
export function Mark({ className }: { className: string }) {
  return (
    <svg viewBox={MARK_VIEW_BOX} aria-hidden="true" focusable="false" className={`w-auto text-accent ${className}`}>
      <path fill="currentColor" d={MARK_PATH} />
    </svg>
  )
}

/**
 * The خِزانة mark, with the name in Latin letters on the English page. A khizāna is where a scholar kept their
 * books. The mark is a shape rather than text, so it looks the same everywhere and takes the theme's colour. The
 * link's name is the app's name in the page's language. `compact` (the narrow rail) shows the mark alone.
 */
export default function Brand({ compact = false }: { compact?: boolean }) {
  const { t, i18n } = useTranslation()

  return (
    <Link to="/" aria-label={t('app.name')} className="inline-flex min-h-10 items-center gap-2.5 rounded-lg">
      <Mark className="h-10" />
      {i18n.language !== 'ar' && !compact && (
        <span aria-hidden="true" className="text-reading font-semibold tracking-tight">
          {t('app.name')}
        </span>
      )}
    </Link>
  )
}
