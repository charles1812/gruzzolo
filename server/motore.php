<?php
/* Giro completo del motore. Da cron (hPanel → Avanzate → Cron, una volta al giorno di notte):
     /usr/bin/php /home/<utente>/domains/<dominio>/public_html/motore/motore.php
   Oppure dal browser per provarlo: motore.php?token=…&full=1 */
require __DIR__ . '/lib.php';
$cli = PHP_SAPI === 'cli';
if (!$cli) {
    header('Content-Type: application/json; charset=utf-8');
    if (!token_ok($_GET['token'] ?? '')) { http_response_code(403); echo json_encode(['error' => 'token']); exit; }
}
set_time_limit(900);
ignore_user_abort(true);
$log = run_all(($cli && in_array('--full', $argv ?? [], true)) || (!$cli && !empty($_GET['full'])));
echo json_encode($log, JSON_UNESCAPED_UNICODE | JSON_PRETTY_PRINT), "\n";
