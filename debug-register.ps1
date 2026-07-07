$WorkingDir = Split-Path -Path $MyInvocation.MyCommand.Path -Parent
Set-Location $WorkingDir
$stdout = Join-Path $WorkingDir 'server.log'
$stderr = Join-Path $WorkingDir 'server_err.log'
if (Test-Path $stdout) { Remove-Item $stdout }
if (Test-Path $stderr) { Remove-Item $stderr }
$process = Start-Process node -ArgumentList 'server.js' -WorkingDirectory $WorkingDir -NoNewWindow -RedirectStandardOutput $stdout -RedirectStandardError $stderr -PassThru
Start-Sleep -Seconds 3
$body = '{"name":"Debug User","email":"debug-user@example.com","phone":"1234567890","password":"Password123!"}'
try {
    $request = [System.Net.WebRequest]::Create('http://localhost:5000/api/register')
    $request.Method = 'POST'
    $request.ContentType = 'application/json'
    $buffer = [System.Text.Encoding]::UTF8.GetBytes($body)
    $request.ContentLength = $buffer.Length
    $stream = $request.GetRequestStream()
    $stream.Write($buffer, 0, $buffer.Length)
    $stream.Close()
    $response = $request.GetResponse()
    $reader = New-Object System.IO.StreamReader $response.GetResponseStream()
    $content = $reader.ReadToEnd()
    Write-Host 'RESPONSE' $response.StatusCode $content
    $reader.Close()
    $response.Close()
} catch [System.Net.WebException] {
    if ($_.Exception.Response -ne $null) {
        $reader = New-Object System.IO.StreamReader $_.Exception.Response.GetResponseStream()
        $content = $reader.ReadToEnd()
        Write-Host 'RESPONSE' $_.Exception.Response.StatusCode $content
        $reader.Close()
    } else {
        Write-Host 'REQUEST ERROR' $_.Exception.Message
    }
}
Start-Sleep -Seconds 1
$process.Kill()
Start-Sleep -Seconds 1
Write-Host '---- SERVER STDOUT ----'
Get-Content $stdout | ForEach-Object { Write-Host $_ }
Write-Host '---- SERVER STDERR ----'
Get-Content $stderr | ForEach-Object { Write-Host $_ }
Remove-Item $stdout, $stderr -ErrorAction SilentlyContinue
