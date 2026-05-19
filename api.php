<?php
$action = $_GET['action'] ?? '';

// File downloads must stream before any other headers
if ($_SERVER['REQUEST_METHOD'] === 'GET' && $action === 'download') {
    $attachments_dir = __DIR__ . '/attachments/';
    $filename = basename($_GET['filename'] ?? '');
    $filepath = $attachments_dir . $filename;
    if (!$filename || !file_exists($filepath)) { http_response_code(404); echo 'Not found'; exit; }
    $original = isset($_GET['original']) ? $_GET['original'] : $filename;
    header('Content-Type: application/octet-stream');
    header('Content-Disposition: attachment; filename="' . addslashes(basename($original)) . '"');
    header('Content-Length: ' . filesize($filepath));
    readfile($filepath);
    exit;
}

header('Content-Type: application/json');
header('Access-Control-Allow-Origin: *');
header('Access-Control-Allow-Methods: GET, POST, DELETE, OPTIONS');
header('Access-Control-Allow-Headers: Content-Type');

if ($_SERVER['REQUEST_METHOD'] === 'OPTIONS') { exit; }

$config_file     = __DIR__ . '/config.json';
$attachments_dir = __DIR__ . '/attachments/';

if (!is_dir($attachments_dir)) { mkdir($attachments_dir, 0775, true); }

function read_config($file) {
    if (!file_exists($file)) return ['bookmarks' => [], 'clips' => []];
    return json_decode(file_get_contents($file), true);
}

function write_config($file, $data) {
    $data['version'] = ($data['version'] ?? 0) + 1;
    file_put_contents($file, json_encode($data, JSON_PRETTY_PRINT | JSON_UNESCAPED_UNICODE));
}

function ids_match($a, $b) {
    return (string)$a === (string)$b;
}

$method = $_SERVER['REQUEST_METHOD'];
$config  = read_config($config_file);

if ($method === 'GET' && $action === 'health') {
    echo json_encode([
        'php_version'           => PHP_VERSION,
        'config_exists'         => file_exists($config_file),
        'config_readable'       => is_readable($config_file),
        'config_writable'       => is_writable($config_file),
        'attachments_exists'    => is_dir($attachments_dir),
        'attachments_readable'  => is_readable($attachments_dir),
        'attachments_writable'  => is_writable($attachments_dir),
        'upload_max_filesize'   => ini_get('upload_max_filesize'),
        'post_max_size'         => ini_get('post_max_size'),
        'max_execution_time'    => ini_get('max_execution_time'),
    ]);

} elseif ($method === 'GET' && $action === 'version') {
    echo json_encode(['version' => $config['version'] ?? 0]);

} elseif ($method === 'GET' && $action === 'config') {
    echo json_encode($config);

} elseif ($method === 'POST' && $action === 'bookmarks') {
    $body = json_decode(file_get_contents('php://input'), true);
    if (!is_array($body)) { http_response_code(400); echo json_encode(['error' => 'Invalid data']); exit; }
    $config['bookmarks'] = $body;
    write_config($config_file, $config);
    echo json_encode(['ok' => true]);

} elseif ($method === 'POST' && $action === 'clip') {
    $body     = json_decode(file_get_contents('php://input'), true);
    $text     = trim($body['text'] ?? '');
    $todayOnly = !empty($body['todayOnly']);
    if (!$text) { http_response_code(400); echo json_encode(['error' => 'No text provided']); exit; }
    $clip = [
        'id'        => (string) round(microtime(true) * 1000),
        'type'      => 'text',
        'text'      => $text,
        'todayOnly' => $todayOnly,
        'createdAt' => date('c')
    ];
    array_unshift($config['clips'], $clip);
    write_config($config_file, $config);
    echo json_encode($clip);

} elseif ($method === 'POST' && $action === 'upload') {
    if (empty($_FILES['file'])) { http_response_code(400); echo json_encode(['error' => 'No file received']); exit; }
    $file      = $_FILES['file'];
    $todayOnly = ($_POST['todayOnly'] ?? '0') === '1';
    if ($file['error'] !== UPLOAD_ERR_OK) { http_response_code(400); echo json_encode(['error' => 'Upload error code ' . $file['error']]); exit; }
    $id           = (string) round(microtime(true) * 1000);
    $safe_original = preg_replace('/[^a-zA-Z0-9._-]/', '_', $file['name']);
    $safe_original = substr($safe_original, 0, 180);
    $safe_name     = $id . '_' . $safe_original;
    $dest         = $attachments_dir . $safe_name;
    if (!move_uploaded_file($file['tmp_name'], $dest)) { http_response_code(500); echo json_encode(['error' => 'Failed to save file']); exit; }
    $clip = [
        'id'           => $id,
        'type'         => 'file',
        'filename'     => $safe_name,
        'originalName' => $file['name'],
        'size'         => $file['size'],
        'todayOnly'    => $todayOnly,
        'createdAt'    => date('c')
    ];
    array_unshift($config['clips'], $clip);
    write_config($config_file, $config);
    echo json_encode($clip);

} elseif ($method === 'POST' && $action === 'update-clip') {
    $id   = $_GET['id'] ?? '';
    $body = json_decode(file_get_contents('php://input'), true);
    $text = $body['text'] ?? null;
    if (!$id || $text === null) { http_response_code(400); echo json_encode(['error' => 'Missing id or text']); exit; }
    $found = false;
    foreach ($config['clips'] as &$clip) {
        if (ids_match($clip['id'], $id) && $clip['type'] === 'text') {
            $clip['text'] = $text;
            $found = true;
            break;
        }
    }
    unset($clip);
    if (!$found) { http_response_code(404); echo json_encode(['error' => 'Clip not found']); exit; }
    write_config($config_file, $config);
    echo json_encode(['ok' => true]);

} elseif ($method === 'DELETE' && $action === 'clip') {
    $id       = $_GET['id'] ?? '';
    $filename = $_GET['filename'] ?? '';
    if ($filename) {
        $safe = basename($filename);
        $path = $attachments_dir . $safe;
        if (file_exists($path)) unlink($path);
    }
    $config['clips'] = array_values(array_filter($config['clips'], fn($c) => !ids_match($c['id'], $id)));
    write_config($config_file, $config);
    echo json_encode(['ok' => true]);

} else {
    http_response_code(404);
    echo json_encode(['error' => 'Unknown action']);
}
