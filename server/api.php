<?php
/* API del motore per l'app Gruzzolo (codice in privato/token.txt).
   GET  api.php?token=…                → { signal, mc, news, storico, log, prices_ts }
   GET  api.php?token=…&what=news&h=[{"t":"SWDA.MI","n":"…"}]  → notizie per quelle posizioni (ogni telefono le sue)
   GET  api.php?token=…&what=vita      → { vita:{ fuel, hicp, elec, gas, hpi } } costo della vita raccolto ogni giorno/settimana
   POST api.php  {"token":…, "input":{…}, "holdings":[{"t":"SWDA.MI","n":"…"}], "run":"mc|news|all"}
        salva i parametri, ricalcola subito gli scenari (pochi secondi) e risponde con i risultati */
require __DIR__ . '/lib.php';
header('Content-Type: application/json; charset=utf-8');
header('Access-Control-Allow-Origin: *');
header('Access-Control-Allow-Methods: GET, POST, OPTIONS');
header('Access-Control-Allow-Headers: Content-Type');
header('Cache-Control: no-store');
if ($_SERVER['REQUEST_METHOD'] === 'OPTIONS') { http_response_code(204); exit; }
set_time_limit(120);

$body = $_SERVER['REQUEST_METHOD'] === 'POST' ? json_decode(file_get_contents('php://input'), true) : null;
$token = $body['token'] ?? ($_GET['token'] ?? '');
if (!token_ok($token)) { http_response_code(403); echo json_encode(['error' => 'token']); exit; }

function clean_input($i) {
    if (!is_array($i) || !is_array($i['w'] ?? null) || !is_array($i['fwd'] ?? null)) return null;
    $ok = ['SWDA', 'EIMI', 'AGGH', 'XEON']; $w = []; $f = [];
    foreach ($i['w'] as $k => $v) { if (!in_array($k, $ok, true)) return null; $w[$k] = max(0, min(1, (float)$v)); }
    foreach ($w as $k => $_) $f[$k] = max(-0.05, min(0.15, (float)($i['fwd'][$k] ?? 0.03)));
    return ['w' => $w, 'fwd' => $f, 'v0' => max(0, min(1e7, (float)($i['v0'] ?? 0))), 'm' => max(0, min(1e5, (float)($i['m'] ?? 0))),
        'infl' => max(0, min(0.1, (float)($i['infl'] ?? 0.02))), 'years' => max(1, min(30, (int)($i['years'] ?? 20))),
        'goal' => max(0, (float)($i['goal'] ?? 0)), 'goalYears' => max(0, min(30, (int)($i['goalYears'] ?? 0))),
        'key' => substr(preg_replace('/[^A-Za-z0-9|._-]/', '', (string)($i['key'] ?? '')), 0, 120)];
}

try {
    if ($body) {
        if (isset($body['holdings']) && is_array($body['holdings'])) {
            $h = [];
            foreach (array_slice($body['holdings'], 0, 20) as $x) {
                $t = preg_replace('/[^A-Za-z0-9.^=_-]/', '', (string)($x['t'] ?? ''));
                if ($t !== '') $h[] = ['t' => substr($t, 0, 20), 'n' => mb_substr(strip_tags((string)($x['n'] ?? $t)), 0, 80)];
            }
            wr('holdings', $h);
        }
        if (isset($body['input'])) {
            $inp = clean_input($body['input']);
            if (!$inp) { http_response_code(400); echo json_encode(['error' => 'input']); exit; }
            wr('input', $inp);
            $run = $body['run'] ?? 'mc';
            if ($run === 'mc' || $run === 'all') task_mc($inp);
        }
        if (($body['run'] ?? '') === 'news' && rd('holdings')) task_news(rd('holdings'));
        if (($body['run'] ?? '') === 'all') run_all(true);
    }
    // notizie: se hanno più di 3 ore le aggiorno subito (pochi secondi)
    if (($_GET['what'] ?? '') === 'news') {
        // con h=[{t,n},…] le notizie sono per le posizioni di quel telefono (non tocco quelle salvate)
        if (isset($_GET['h']) && ($hp = holdings_param($_GET['h'])) !== null) { echo json_encode(['news' => news_for($hp)], JSON_UNESCAPED_UNICODE | JSON_UNESCAPED_SLASHES); exit; }
        $n = rd('news'); $h = rd('holdings');
        if ($h && (!$n || time() - ($n['_ts'] ?? 0) > 3 * 3600 || !isset($n['items'][0]['articles']))) $n = task_news($h);
        echo json_encode(['news' => $n], JSON_UNESCAPED_UNICODE | JSON_UNESCAPED_SLASHES); exit;
    }
    // costo della vita raccolto dal motore; se non c'è ancora lo raccolgo adesso (circa 20 secondi)
    if (($_GET['what'] ?? '') === 'vita') { $v = rd('vita'); if (!$v || !empty($_GET['refresh'])) { task_vita(true); $v = rd('vita'); }
        echo json_encode(['vita' => $v], JSON_UNESCAPED_UNICODE | JSON_UNESCAPED_SLASHES); exit; }
    $p = rd('prices');
    echo json_encode(['signal' => rd('signal'), 'mc' => rd('mc'), 'news' => rd('news'), 'storico' => rd('storico'),
        'log' => rd('log'), 'prices_ts' => $p['_ts'] ?? 0, 'server_ts' => time()], JSON_UNESCAPED_UNICODE | JSON_UNESCAPED_SLASHES);
} catch (Throwable $e) {
    http_response_code(500); echo json_encode(['error' => $e->getMessage()]);
}
