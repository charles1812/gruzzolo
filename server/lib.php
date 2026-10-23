<?php
/* Gruzzolo — motore sul server (stessa logica di Engine.java nel telefono).
   dati      prezzi mensili degli ETF del piano e del satellite (Yahoo), storico allungato
   segnale   verifica se il momentum sui versamenti funziona ancora (top 3 contro media e contro i 3 peggiori)
   scenari   20.000 futuri possibili per i parametri inviati dall'app (bootstrap a blocchi di 12 mesi)
   notizie   titoli sulle posizioni e sentiment con un dizionario finanziario
   Tutti i file in privato/ (non accessibile dal web). */

const PRIV = __DIR__ . '/privato';
const CORE = ['SWDA.MI', 'EIMI.MI', 'EUNA.DE', 'XEON.MI'];
const SAT  = ['XDWT.DE', 'XDWH.DE', 'XDWF.DE', 'XDWI.DE', 'XDWC.DE', 'XDWS.DE', 'XDWU.DE', 'XDW0.DE',
              'XDWM.DE', 'XWTS.DE', 'IUSN.DE', 'EIMI.MI', 'IJPA.AS', 'SMEA.MI', '4GLD.DE'];
const TAX = 0.26;
function rd($name) { $f = PRIV . "/$name.json"; return is_file($f) ? json_decode(file_get_contents($f), true) : null; }
function wr($name, $data) {
    $f = PRIV . "/$name.json"; $tmp = $f . '.tmp';
    $fp = fopen(PRIV . '/.lock', 'c'); flock($fp, LOCK_EX);
    file_put_contents($tmp, json_encode($data, JSON_UNESCAPED_UNICODE | JSON_UNESCAPED_SLASHES)); rename($tmp, $f);
    flock($fp, LOCK_UN); fclose($fp);
}
function token_ok($t) { $real = trim(@file_get_contents(PRIV . '/token.txt')); return $real !== '' && is_string($t) && hash_equals($real, $t); }

function http_get($url) {
    $ch = curl_init($url);
    curl_setopt_array($ch, [CURLOPT_RETURNTRANSFER => true, CURLOPT_FOLLOWLOCATION => true, CURLOPT_TIMEOUT => 60, CURLOPT_CONNECTTIMEOUT => 12,
        CURLOPT_USERAGENT => 'Mozilla/5.0 (X11; Linux x86_64) Gruzzolo/1.0', CURLOPT_HTTPHEADER => ['Accept: application/json, application/rss+xml, text/xml, */*']]);
    $b = curl_exec($ch); $code = curl_getinfo($ch, CURLINFO_HTTP_CODE); curl_close($ch);
    if ($b === false || $code >= 400) throw new Exception("HTTP $code $url");
    return $b;
}

/* ---------------- 1. dati ---------------- */
function yahoo_monthly($sym) {
    $j = json_decode(http_get('https://query1.finance.yahoo.com/v8/finance/chart/' . rawurlencode($sym) . '?interval=1mo&range=max'), true);
    $r = $j['chart']['result'][0] ?? null; if (!$r) throw new Exception("niente dati per $sym");
    $ts = $r['timestamp']; $off = $r['meta']['gmtoffset'] ?? 0;
    $px = $r['indicators']['adjclose'][0]['adjclose'] ?? $r['indicators']['quote'][0]['close'];
    $cur = gmdate('Y-m'); $out = [];
    foreach ($ts as $i => $t) {
        $p = $px[$i] ?? null; if (!$p || $p <= 0) continue;
        $k = gmdate('Y-m', $t + $off + 6 * 3600);
        if ($k < $cur) $out[$k] = $p;     // il mese in corso non è chiuso
    }
    return $out;
}

function task_data(&$log) {
    $prices = []; $ok = 0;
    foreach (array_unique(array_merge(CORE, SAT)) as $s) {
        try { $prices[$s] = yahoo_monthly($s); $ok++; } catch (Exception $e) { $log['err_' . $s] = $e->getMessage(); }
        usleep(400000);
    }
    $prices['_ts'] = time();
    wr('prices', $prices);
    // storico allungato con i mesi chiusi nuovi
    $h = rd('storico');
    $map = ['SWDA' => 'SWDA.MI', 'EIMI' => 'EIMI.MI', 'AGGH' => 'EUNA.DE', 'XEON' => 'XEON.MI'];
    $last = $h['to']; $added = 0;
    while (true) {
        $next = date('Y-m', strtotime($last . '-01 +1 month'));
        if ($next >= gmdate('Y-m')) break;
        $r = [];
        foreach ($map as $k => $t) {
            if (!isset($prices[$t][$next], $prices[$t][$last])) { $r = null; break; }
            $r[$k] = round($prices[$t][$next] / $prices[$t][$last] - 1, 6);
        }
        if (!$r) break;
        $h['months'][] = $next; foreach ($r as $k => $v) $h['r'][$k][] = $v;
        $last = $next; $added++;
    }
    $h['to'] = $last;
    if ($added) wr('storico', $h);
    return ['tickers' => $ok, 'of' => count(array_unique(array_merge(CORE, SAT))), 'newMonths' => $added, 'to' => $last];
}

/* ---------------- 2. segnale ---------------- */
function mom($p, $i, $L) { return $p[$i - 1] / $p[$i - 1 - $L] - 1; }
function pick_by($px, $W, $i, $L, $best) {
    $idx = range(0, $W - 1);
    usort($idx, function ($a, $b) use ($px, $i, $L, $best) { $d = mom($px[$a], $i, $L) <=> mom($px[$b], $i, $L); return $best ? -$d : $d; });
    return [$idx[0] => 1 / 3, $idx[1] => 1 / 3, $idx[2] => 1 / 3];
}
/* PAC di 1 €/mese, mai vendere, tasse 26% solo alla fine: netto/versato */
function pac($px, $rule, $i0, $i1) {
    $val = array_fill(0, count($px), 0.0); $paid = 0;
    for ($i = $i0; $i < $i1; $i++) {
        foreach ($rule($i) as $j => $w) $val[$j] += $w;
        $paid += 1;
        foreach ($val as $j => $v) if ($v != 0) $val[$j] = $v * $px[$j][$i] / $px[$j][$i - 1];
    }
    $V = array_sum($val);
    return ($V - max(0, $V - $paid) * TAX) / $paid;
}
function med($a) { if (!$a) return 0; sort($a); return $a[intdiv(count($a), 2)]; }

function task_signal() {
    $P = rd('prices'); $U = array_values(array_filter(SAT, fn($s) => isset($P[$s])));
    $M = array_keys($P['XDWF.DE']);
    $M = array_values(array_filter($M, function ($k) use ($P, $U) { if (!isset($P['SWDA.MI'][$k])) return false; foreach ($U as $s) if (!isset($P[$s][$k])) return false; return true; }));
    sort($M); $T = count($M); $W = count($U);
    $px = [];
    foreach ($U as $j => $s) foreach ($M as $t => $k) $px[$j][$t] = $P[$s][$k];
    foreach ($M as $t => $k) $px[$W][$t] = $P['SWDA.MI'][$k];
    $rules = [
        'mondo' => fn($i) => [$W => 1.0],
        'pariPeso' => function ($i) use ($W) { $o = []; for ($j = 0; $j < $W; $j++) $o[$j] = 1 / $W; return $o; },
        'top3' => fn($i) => pick_by($px, $W, $i, 12, true),
        'peggiori3' => fn($i) => pick_by($px, $W, $i, 12, false),
    ];
    $res = ['from' => $M[0], 'to' => $M[$T - 1], 'months' => $T];
    foreach ([36, 60] as $H) {
        $base = null; $h = [];
        foreach ($rules as $name => $rule) {
            $a = []; for ($i = 13; $i + $H <= $T; $i++) $a[] = pac($px, $rule, $i, $i + $H);
            if ($name === 'mondo') $base = $a;
            $beat = 0; foreach ($a as $k => $v) if ($v > $base[$k]) $beat++;
            $h[$name] = ['median' => med($a), 'worst' => $a ? min($a) : 0, 'beatWorld' => $a ? $beat / count($a) : 0, 'n' => count($a)];
        }
        $res['h' . $H] = $h;
    }
    $score = 0;
    foreach (['h36', 'h60'] as $h) {
        $t = $res[$h]['top3']['median'];
        if ($t > $res[$h]['pariPeso']['median']) $score++;
        if ($t > $res[$h]['peggiori3']['median']) $score++;
    }
    $res['verdict'] = $score >= 4 ? 'funziona' : ($score >= 2 ? 'debole' : 'non funziona');
    $res['score'] = $score;
    $idx = range(0, $W - 1);
    usort($idx, fn($a, $b) => mom($px[$b], $T, 12) <=> mom($px[$a], $T, 12));
    $res['ranking'] = [];
    foreach ($idx as $k => $j) $res['ranking'][] = ['t' => $U[$j], 'mom' => mom($px[$j], $T, 12), 'px' => $px[$j][$T - 1], 'rank' => $k + 1];
    $res['tickers'] = $U; $res['_ts'] = time();
    wr('signal', $res);
    return $res;
}

/* ---------------- 3. scenari ---------------- */
function task_mc($inp, $paths = 20000) {
    $h = rd('storico'); $w = $inp['w']; $fwd = $inp['fwd'];
    $v0 = (float)($inp['v0'] ?? 0); $m = (float)($inp['m'] ?? 0); $infl = (float)($inp['infl'] ?? 0.02); $years = min(30, max(1, (int)($inp['years'] ?? 20)));
    $keys = array_keys($w); $T = count($h['months']); $r = []; $wk = [];
    foreach ($keys as $k) {
        $a = $h['r'][$k]; $mean = array_sum($a) / $T;
        $adj = pow(1 + $fwd[$k], 1 / 12) - 1 - $mean;      // rendimenti medi prudenti, volatilità e crolli veri
        $r[] = array_map(fn($x) => $x + $adj, $a); $wk[] = (float)$w[$k];
    }
    $K = count($keys);
    // rendimento mensile del portafoglio per ogni mese storico (pesi costanti)
    $mix = array_fill(0, $T, 0.0);
    for ($t = 0; $t < $T; $t++) for ($k = 0; $k < $K; $k++) $mix[$t] += $wk[$k] * $r[$k][$t];
    mt_srand(20261015 + (int)round($m) + 31 * (int)round($v0));
    $at = array_fill(0, $years + 1, []);
    $defl = []; for ($y = 1; $y <= $years; $y++) $defl[$y] = pow(1 + $infl, $y);
    for ($p = 0; $p < $paths; $p++) {
        $v = $v0; $at[0][] = $v0;
        for ($y = 1; $y <= $years; $y++) {
            $s = mt_rand(0, $T - 13);
            for ($j = 0; $j < 12; $j++) $v = ($v + $m) * (1 + $mix[$s + $j]);
            $at[$y][] = $v / $defl[$y];
        }
    }
    $res = [];
    $qs = ['p5' => .05, 'p10' => .10, 'p25' => .25, 'p50' => .50, 'p75' => .75, 'p90' => .90, 'p95' => .95];
    foreach ($at as $y => &$col) sort($col); unset($col);
    foreach ($qs as $n => $q) { $res[$n] = []; for ($y = 0; $y <= $years; $y++) $res[$n][] = round($at[$y][min($paths - 1, (int)floor($q * $paths))]); }
    $goal = (float)($inp['goal'] ?? 0); $gy = (int)($inp['goalYears'] ?? 0);
    if ($goal > 0 && $gy > 0 && $gy <= $years) { $ok = 0; foreach ($at[$gy] as $x) if ($x >= $goal) $ok++; $res['goalProb'] = $ok / $paths; }
    $res['belowPaid'] = [];
    foreach ([1, 3, 5, 10] as $y) { if ($y > $years) continue; $paid = ($v0 + $m * 12 * $y) / $defl[$y]; $n = 0; foreach ($at[$y] as $x) if ($x < $paid) $n++; $res['belowPaid'][$y] = $n / $paths; }
    $res['paths'] = $paths; $res['years'] = $years; $res['key'] = $inp['key'] ?? ''; $res['_ts'] = time();
    wr('mc', $res);
    return $res;
}

/* ---------------- 4. notizie ---------------- */
const NEG = ['loss','losses','decline','declines','fall','falls','fell','drop','drops','plunge','plunges','slump','lawsuit','fraud','investigation','probe',
 'downgrade','downgrades','cut','cuts','miss','misses','missed','warning','warns','weak','weaker','bankruptcy','default','layoff','layoffs','recall','fined',
 'crash','tumble','tumbles','sink','sinks','concern','concerns','slowdown','recession','selloff','sell-off','slides','slide','lower','bearish','risk',
 'perdita','perdite','calo','cala','crollo','crolla','scende','ribasso','taglio','tagli','multa','indagine','inchiesta','declassa','declassamento','crisi',
 'licenziamenti','fallimento','allarme','frena','frenata','debole','giù','affonda','rosso','vendite','timori','timore','paura','paure','ribassi','scivola','scivolano','cede','cedono','perde','perdono','crollano','tonfo','tensioni','dazi','dazio','stretta','pressione','pressioni','svendita','sell','preoccupazioni','preoccupa','rischi','rallenta','rallentamento','inflazione','incertezza','negativo','negativa','peggiora','minimi','affossa','frenano','calano','scendono','bocciatura','downgrade','guerra','recessione'];
const POS = ['gain','gains','rise','rises','rose','surge','surges','jump','jumps','rally','rallies','beat','beats','record','upgrade','upgrades','growth',
 'strong','stronger','profit','profits','raise','raises','raised','boost','boosts','outperform','bullish','soar','soars','wins','win','deal','approval',
 'higher','tops','dividend','utile','utili','rialzo','sale','salgono','balzo','crescita','promozione','accordo','commessa','contratto','dividendo',
 'guadagna','vola','rafforza','verde','migliora','positivo','rialzi','rally','massimi','corre','corrono','guadagnano','volano','recupera','recuperano','rimbalzo','rimbalza','ottimismo','acquisti','promossa','promuove','crescono','cresce','forte','solidi','solido','sopra','batte','superano','supera','balza','balzano','spinta','sostegno','ripresa','boom','accelera'];

function sentiment($title) {
    $w = preg_split('/\s+/u', trim(preg_replace('/[^\p{L}\- ]/u', ' ', mb_strtolower($title))));
    $pos = 0; $neg = 0;
    foreach ($w as $i => $x) {
        $p = in_array($x, POS, true); $n = in_array($x, NEG, true);
        if ($i > 0 && in_array($w[$i - 1], ['non', 'not', 'no'], true)) { [$p, $n] = [$n, $p]; }
        if ($p) $pos++; if ($n) $neg++;
    }
    return $pos + $neg ? ($pos - $neg) / ($pos + $neg) : 0;
}

/* argomento da cercare: per gli ETF il mercato che seguono, per le azioni il nome dell'azienda */
const NEWS_TOPIC = [
    'SWDA.MI' => 'MSCI World borsa', 'EIMI.MI' => 'mercati emergenti borsa', 'AGGH.MI' => 'obbligazioni tassi BCE Fed',
    'XEON.MI' => 'BCE tassi di interesse', 'XDWT.DE' => 'titoli tecnologici borsa', 'XDWH.DE' => 'farmaceutici borsa',
    'XDWF.DE' => 'banche borsa', 'XDWI.DE' => 'industria borsa', 'XDWC.DE' => 'beni di consumo borsa', 'XDWS.DE' => 'beni di prima necessità borsa',
    'XDWU.DE' => 'utility energia borsa', 'XDW0.DE' => 'petrolio borsa energia', 'XDWM.DE' => 'materie prime borsa', 'XWTS.DE' => 'telecomunicazioni borsa',
    'IUSN.DE' => 'small cap borsa', 'IJPA.AS' => 'borsa Tokyo Giappone', 'SMEA.MI' => 'borse europee', '4GLD.DE' => 'prezzo oro',
];
function news_topic($t, $name) {
    if (isset(NEWS_TOPIC[$t])) return NEWS_TOPIC[$t];
    if (preg_match('/msci world/i', $name)) return 'MSCI World borsa';
    if (preg_match('/emerging|emergent/i', $name)) return 'mercati emergenti borsa';
    $q = trim(preg_replace('/\b(ucits|etf|acc|usd|eur|inc|spa|s\.p\.a\.|plc|corp|ltd|core|ishares|xtrackers|vanguard|amundi)\b|\(acc\)/i', '', $name));
    return '"' . ($q ?: $t) . '" azioni';
}
function google_news($q, $max = 8) {
    $out = []; $weekAgo = time() - 7 * 86400;
    $x = @simplexml_load_string(http_get('https://news.google.com/rss/search?q=' . rawurlencode($q . ' when:7d') . '&hl=it&gl=IT&ceid=IT:it'));
    if (!$x) return $out;
    foreach ($x->channel->item as $it) {
        $ts = strtotime((string)$it->pubDate) ?: 0;
        if ($ts && $ts < $weekAgo) continue;
        $title = (string)$it->title; $src = (string)$it->source;
        if ($src && str_ends_with($title, ' - ' . $src)) $title = substr($title, 0, -strlen(' - ' . $src));
        $out[] = ['title' => $title, 'link' => (string)$it->link, 'src' => $src ?: 'Google News', 'ts' => $ts * 1000, 's' => round(sentiment($title), 2)];
        if (count($out) >= $max) break;
    }
    usort($out, fn($a, $b) => $b['ts'] <=> $a['ts']);
    return $out;
}

/* notizie con immagine di anteprima: Bing Notizie (Italia) dà l'immagine e il link vero dell'articolo;
   se trova poco, completo con Google News; agli articoli senza immagine provo a prendere quella che il giornale
   dichiara per la condivisione (og:image), con un tempo breve. */
function bing_news($q, $max = 8) {
    $out = []; $weekAgo = time() - 7 * 86400;
    $xml = http_get('https://www.bing.com/news/search?q=' . rawurlencode($q) . '&format=rss&setlang=it&cc=IT&mkt=it-IT');
    if (!preg_match_all('#<item>(.*?)</item>#s', $xml, $m)) return $out;
    $tag = function ($b, $t) { return preg_match('#<' . $t . '>(.*?)</' . $t . '>#s', $b, $x) ? html_entity_decode(strip_tags($x[1]), ENT_QUOTES | ENT_XML1, 'UTF-8') : ''; };
    foreach ($m[1] as $b) {
        $ts = strtotime($tag($b, 'pubDate')) ?: 0;
        if ($ts && $ts < $weekAgo) continue;
        $link = $tag($b, 'link');
        if (preg_match('#[?&]url=([^&]+)#', $link, $u)) $link = urldecode($u[1]);      // link diretto all'articolo
        $img = $tag($b, 'News:Image');
        if ($img) $img = preg_replace('#^http:#', 'https:', $img) . '&w=320&h=180&c=7';
        $title = trim($tag($b, 'title'));
        if ($title === '' || !preg_match('#^https?://#', $link)) continue;
        // niente pagine di quotazione (il titolo è solo il nome del fondo) e niente articoli in lingue che non leggi
        if (preg_match('#\bucits\b.*\betf\b[^a-z]*$#i', $title) || str_starts_with($tag($b, 'description'), 'Ultimo prezzo')) continue;
        if (preg_match('/[ıİşŞğĞ]|[\x{0400}-\x{04FF}\x{0600}-\x{06FF}\x{0590}-\x{05FF}\x{3040}-\x{30FF}\x{4E00}-\x{9FFF}]/u', $title)) continue;
        $out[] = ['title' => $title, 'link' => $link, 'src' => $tag($b, 'News:Source') ?: 'Bing', 'ts' => $ts * 1000, 's' => round(sentiment($title), 2), 'img' => $img];
        if (count($out) >= $max) break;
    }
    return $out;
}
function og_image($url) {
    if (!preg_match('#^https?://#', $url) || str_contains($url, 'news.google.com')) return '';
    $ch = curl_init($url);
    curl_setopt_array($ch, [CURLOPT_RETURNTRANSFER => true, CURLOPT_FOLLOWLOCATION => true, CURLOPT_TIMEOUT => 5, CURLOPT_CONNECTTIMEOUT => 3,
        CURLOPT_USERAGENT => 'Mozilla/5.0 (X11; Linux x86_64) Gruzzolo/1.0', CURLOPT_RANGE => '0-150000']);
    $b = curl_exec($ch); curl_close($ch);
    if (!$b) return '';
    if (preg_match('#<meta[^>]+(?:property|name)=["\'](?:og:image|twitter:image)["\'][^>]+content=["\']([^"\']+)#i', $b, $x)
        || preg_match('#<meta[^>]+content=["\']([^"\']+)["\'][^>]+(?:property|name)=["\'](?:og:image|twitter:image)["\']#i', $b, $x)) {
        $img = html_entity_decode($x[1]);
        return preg_match('#^https://#', $img) ? $img : '';
    }
    return '';
}
function news_search($q, $max = 8) {
    $a = []; try { $a = bing_news($q, $max); } catch (Exception $e) {}
    if (count($a) < 4) {
        $seen = array_map(fn($x) => mb_strtolower(mb_substr($x['title'], 0, 40)), $a);
        try { foreach (google_news($q, $max) as $g) { if (count($a) >= $max) break; if (!in_array(mb_strtolower(mb_substr($g['title'], 0, 40)), $seen, true)) { $g['img'] = ''; $a[] = $g; } } } catch (Exception $e) {}
    }
    $tries = 0;
    foreach ($a as &$x) { if (empty($x['img']) && $tries < 4) { $tries++; $x['img'] = og_image($x['link']); } }
    unset($x);
    usort($a, fn($p, $q2) => $q2['ts'] <=> $p['ts']);
    return $a;
}

function task_news($holdings, $file = 'news') {
    $items = [];
    // notizie generali sui mercati
    try { $items[] = ['t' => '_mercati', 'n' => 'Mercati', 'q' => 'borsa mercati finanziari', 'articles' => news_search('Borsa Milano Wall Street mercati', 10)]; } catch (Exception $e) {}
    $seen = [];
    foreach (array_slice($holdings, 0, 20) as $h) {
        $t = $h['t'] ?? ''; $name = $h['n'] ?? $t;
        $q = news_topic($t, $name);
        if (isset($seen[$q])) continue; $seen[$q] = true;
        try { $arts = news_search($q, 8); } catch (Exception $e) { $arts = []; }
        usleep(400000);
        $items[] = ['t' => $t, 'n' => $name, 'q' => $q, 'articles' => $arts];
    }
    foreach ($items as &$it) {
        $a = $it['articles']; $n = count($a); $sum = array_sum(array_column($a, 's'));
        $it['count'] = $n; $it['score'] = $n ? $sum / $n : 0;
        $sorted = $a; usort($sorted, fn($x, $y) => $x['s'] <=> $y['s']);
        $it['worst'] = array_values(array_map(fn($x) => [$x['s'], $x['title'], $x['src'], $x['ts']], array_filter(array_slice($sorted, 0, 2), fn($x) => $x['s'] < 0)));
        $it['best'] = array_values(array_map(fn($x) => [$x['s'], $x['title'], $x['src'], $x['ts']], array_filter(array_slice(array_reverse($sorted), 0, 2), fn($x) => $x['s'] > 0)));
    }
    unset($it);
    $res = ['items' => $items, '_ts' => time()];
    wr($file, $res);
    return $res;
}

/* notizie per le posizioni di chi le chiede (ogni telefono ha le sue): una copia per ogni elenco di ETF,
   rifatta se ha più di 3 ore. Le copie non usate da una settimana si cancellano. */
function holdings_param($json) {
    $a = json_decode((string)$json, true); if (!is_array($a)) return null;
    $h = [];
    foreach (array_slice($a, 0, 20) as $x) {
        $t = preg_replace('/[^A-Za-z0-9.^=_-]/', '', (string)($x['t'] ?? ''));
        if ($t !== '') $h[] = ['t' => substr($t, 0, 20), 'n' => mb_substr(strip_tags((string)($x['n'] ?? $t)), 0, 80)];
    }
    return $h;
}
function news_for($h) {
    $ts = array_column($h, 't'); sort($ts);
    $file = 'news_' . substr(md5(implode(',', $ts)), 0, 12);
    $n = rd($file);
    if (!$n || time() - ($n['_ts'] ?? 0) > 3 * 3600 || !isset($n['items'][0]['articles'])) $n = task_news($h, $file);
    foreach (glob(PRIV . '/news_*.json') ?: [] as $f) if (filemtime($f) < time() - 7 * 86400) @unlink($f);
    return $n;
}

/* ---------------- giro completo (cron notturno) ---------------- */
/* ---------------- 5. costo della vita: raccolta che si allunga nel tempo ----------------
   Ogni notte: prezzo mediano di benzina e gasolio self (Italia e provincia di Milano) dal Ministero delle Imprese.
   Ogni settimana: serie Eurostat (prezzi al consumo di cibo, affitti, luce, gas, carburanti e indice generale;
   prezzo di luce e gas per le famiglie in €/kWh; indice dei prezzi delle case).
   Tutto finisce in privato/vita.json: i valori nuovi si aggiungono a quelli vecchi, niente si perde. */
const VITA_HICP = ['TOTAL', 'CP011', 'CP041', 'CP0451', 'CP0452', 'CP07222', 'CP07221'];
function es_series($q, $keyDim = null) {
    $j = json_decode(http_get('https://ec.europa.eu/eurostat/api/dissemination/statistics/1.0/data/' . $q), true);
    if (!$j || !isset($j['id'])) throw new Exception('eurostat');
    $ids = $j['id']; $size = $j['size']; $cats = [];
    foreach ($ids as $d) { $a = []; foreach ($j['dimension'][$d]['category']['index'] as $k => $i) $a[$i] = $k; $cats[] = $a; }
    $tPos = array_search('time', $ids); $kPos = $keyDim ? array_search($keyDim, $ids) : -1; $out = [];
    foreach (($j['value'] ?? []) as $n => $v) {
        $r = (int)$n; $c = [];
        for ($i = count($ids) - 1; $i >= 0; $i--) { $c[$i] = $r % $size[$i]; $r = intdiv($r, $size[$i]); }
        $key = $kPos >= 0 ? $cats[$kPos][$c[$kPos]] : '_';
        $out[$key][$cats[$tPos][$c[$tPos]]] = $v;
    }
    foreach ($out as &$s) ksort($s);
    return ['s' => $out, 'upd' => $j['updated'] ?? null];
}
function vita_merge(&$dst, $src) { foreach ($src as $k => $v) $dst[$k] = $v; ksort($dst); }
function vita_fuel() {
    // anagrafica: quali impianti sono in provincia di Milano (la aggiorno una volta al mese)
    $mi = rd('vita_mi');
    if (!$mi || time() - ($mi['_ts'] ?? 0) > 30 * 86400) {
        $ids = [];
        foreach (explode("\n", http_get('https://www.mimit.gov.it/images/exportCSV/anagrafica_impianti_attivi.csv')) as $l) {
            $f = explode('|', $l); if (count($f) > 7 && trim($f[7]) === 'MI') $ids[$f[0]] = 1;
        }
        if (count($ids) > 50) { $mi = ['_ts' => time(), 'ids' => array_keys($ids)]; wr('vita_mi', $mi); }
    }
    $miSet = array_flip($mi['ids'] ?? []);
    $csv = http_get('https://www.mimit.gov.it/images/exportCSV/prezzo_alle_8.csv');
    $lines = explode("\n", $csv); $est = preg_match('/(\d{4}-\d{2}-\d{2})/', $lines[0] ?? '', $m) ? $m[1] : date('Y-m-d');
    $lim = strtotime($est) - 7 * 86400; $B = []; $G = []; $Bm = []; $Gm = [];
    for ($i = 2, $n = count($lines); $i < $n; $i++) {
        $f = explode('|', $lines[$i]); if (count($f) < 5 || $f[3] !== '1') continue;
        $p = (float)$f[2]; if ($p <= 1 || $p >= 3.5) continue;
        if (preg_match('#(\d{2})/(\d{2})/(\d{4})#', $f[4], $d) && mktime(0, 0, 0, (int)$d[2], (int)$d[1], (int)$d[3]) < $lim) continue;
        $isMi = isset($miSet[$f[0]]);
        if ($f[1] === 'Benzina') { $B[] = $p; if ($isMi) $Bm[] = $p; }
        elseif ($f[1] === 'Gasolio') { $G[] = $p; if ($isMi) $Gm[] = $p; }
    }
    if (count($B) < 1000) throw new Exception('carburanti: pochi dati');
    return [$est, ['b' => med($B), 'g' => med($G), 'bMI' => $Bm ? med($Bm) : null, 'gMI' => $Gm ? med($Gm) : null, 'nb' => count($B), 'ng' => count($G)]];
}
function task_vita($force = false) {
    $v = rd('vita') ?: ['fuel' => [], 'hicp' => [], 'elec' => [], 'gas' => [], 'hpi' => [], 'upd' => []];
    $log = [];
    try { [$d, $row] = vita_fuel(); $v['fuel'][$d] = $row; ksort($v['fuel']); $log['fuel'] = $d; } catch (Throwable $e) { $log['fuelErr'] = $e->getMessage(); }
    if ($force || time() - ($v['esTs'] ?? 0) > 6 * 86400) {
        $y0 = (int)date('Y') - 10;
        try { $r = es_series('prc_hicp_minr?geo=IT&unit=I15&' . implode('&', array_map(fn($c) => "coicop18=$c", VITA_HICP)) . "&sinceTimePeriod=$y0-01", 'coicop18');
            foreach ($r['s'] as $k => $s) { $v['hicp'][$k] = $v['hicp'][$k] ?? []; vita_merge($v['hicp'][$k], $s); } $v['upd']['hicp'] = $r['upd']; } catch (Throwable $e) { $log['hicpErr'] = $e->getMessage(); }
        foreach (['elec' => "nrg_pc_204?geo=IT&nrg_cons=KWH2500-4999&tax=I_TAX&currency=EUR&unit=KWH&sinceTimePeriod=$y0-S1",
                  'gas' => "nrg_pc_202?geo=IT&nrg_cons=GJ20-199&tax=I_TAX&currency=EUR&unit=KWH&sinceTimePeriod=$y0-S1",
                  'hpi' => "prc_hpi_q?geo=IT&purchase=TOTAL&unit=I15_Q&sinceTimePeriod=$y0-Q1"] as $k => $q) {
            try { $r = es_series($q); vita_merge($v[$k], $r['s']['_'] ?? []); $v['upd'][$k] = $r['upd']; } catch (Throwable $e) { $log[$k . 'Err'] = $e->getMessage(); }
        }
        $v['esTs'] = time();
    }
    $v['_ts'] = time(); wr('vita', $v);
    $log['days'] = count($v['fuel']);
    return $log;
}

function run_all($full = false) {
    $log = ['start' => time()];
    try {
        $p = rd('prices');
        if ($full || !$p || time() - ($p['_ts'] ?? 0) > 6 * 86400) { $t = microtime(true); $log['data'] = task_data($log); $log['dataMs'] = round((microtime(true) - $t) * 1000); }
        $s = rd('signal');
        if (($full || !$s || time() - ($s['_ts'] ?? 0) > 25 * 86400) && rd('prices')) { $t = microtime(true); $log['signal'] = task_signal()['verdict']; $log['signalMs'] = round((microtime(true) - $t) * 1000); }
        $inp = rd('input');
        if ($inp) { $t = microtime(true); $log['mcPaths'] = task_mc($inp)['paths']; $log['mcMs'] = round((microtime(true) - $t) * 1000); }
        $t = microtime(true); $log['vita'] = task_vita($full); $log['vitaMs'] = round((microtime(true) - $t) * 1000);
        $hold = rd('holdings');
        if ($hold) { $t = microtime(true); $log['news'] = count(task_news($hold)['items']); $log['newsMs'] = round((microtime(true) - $t) * 1000); }
        $log['ok'] = true;
    } catch (Throwable $e) { $log['ok'] = false; $log['error'] = $e->getMessage(); }
    $log['end'] = time(); $log['ms'] = ($log['end'] - $log['start']) * 1000;
    $runs = rd('log') ?: []; $runs[] = $log; wr('log', array_slice($runs, -10));
    return $log;
}
