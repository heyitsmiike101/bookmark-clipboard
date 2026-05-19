<?php
header('Content-Type: text/plain');
echo "PHP is working. Version: " . PHP_VERSION . "\n\n";

$config_file = __DIR__ . '/config.json';
echo "--- config.json ---\n";
echo "Path:     $config_file\n";
echo "Exists:   " . (file_exists($config_file)  ? "YES" : "NO") . "\n";
echo "Readable: " . (is_readable($config_file)  ? "YES" : "NO") . "\n";
echo "Writable: " . (is_writable($config_file)  ? "YES" : "NO") . "\n\n";

$attach_dir = __DIR__ . '/attachments';
echo "--- attachments/ ---\n";
echo "Path:     $attach_dir\n";
echo "Exists:   " . (is_dir($attach_dir)         ? "YES" : "NO (create it)") . "\n";
echo "Readable: " . (is_readable($attach_dir)    ? "YES" : "NO") . "\n";
echo "Writable: " . (is_writable($attach_dir)    ? "YES" : "NO") . "\n\n";

echo "--- Upload limits (effective) ---\n";
echo "upload_max_filesize: " . ini_get('upload_max_filesize') . "\n";
echo "post_max_size:       " . ini_get('post_max_size') . "\n";
echo "max_execution_time:  " . ini_get('max_execution_time') . "\n";
