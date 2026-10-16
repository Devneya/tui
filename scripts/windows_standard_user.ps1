param([Parameter(Mandatory=$true)][string]$Candidate)
$ErrorActionPreference='Stop'
$name='devneya'+([Guid]::NewGuid().ToString('N').Substring(0,10))
$root=Join-Path $env:WINDIR ('Temp\devneya-standard-'+[Guid]::NewGuid().ToString('N'))
$password=ConvertTo-SecureString ('Aa!9'+[Guid]::NewGuid().ToString('N')) -AsPlainText -Force
$created=$false
try {
  New-LocalUser -Name $name -Password $password -AccountNeverExpires -PasswordNeverExpires | Out-Null
  $created=$true
  $user=Get-LocalUser -Name $name
  $usersGroup=Get-LocalGroup -SID 'S-1-5-32-545'
  Add-LocalGroupMember -Group $usersGroup -Member $user
  New-Item -ItemType Directory -Path $root | Out-Null
  $acl=Get-Acl $root
  $rule=[System.Security.AccessControl.FileSystemAccessRule]::new($user.SID,'FullControl','ContainerInherit,ObjectInherit','None','Allow')
  $acl.AddAccessRule($rule)
  Set-Acl -Path $root -AclObject $acl
  $copy=Join-Path $root 'devneya.exe'
  Copy-Item -LiteralPath $Candidate -Destination $copy
  New-Item -ItemType Directory -Path (Join-Path $root 'home') | Out-Null
  $start=[System.Diagnostics.ProcessStartInfo]::new()
  $start.FileName=$copy
  $start.ArgumentList.Add('doctor');$start.ArgumentList.Add('--json')
  $start.WorkingDirectory=$root
  $start.UseShellExecute=$false
  $start.UserName=$name;$start.Domain=$env:COMPUTERNAME;$start.Password=$password;$start.LoadUserProfile=$true
  $start.RedirectStandardOutput=$true;$start.RedirectStandardError=$true;$start.CreateNoWindow=$true
  $start.Environment['DEVNEYA_HOME']=Join-Path $root 'state'
  $start.Environment['USERPROFILE']=Join-Path $root 'home'
  $start.Environment['HOME']=Join-Path $root 'home'
  $start.Environment['NODE_OPTIONS']='--invalid-inherited-option'
  $child=[System.Diagnostics.Process]::Start($start)
  if (-not $child.WaitForExit(180000)) { $child.Kill($true);throw 'Standard-user bootstrap timed out' }
  $text=$child.StandardOutput.ReadToEnd()
  if ($child.ExitCode -ne 0) { throw 'Standard-user doctor failed' }
  $report=$text | ConvertFrom-Json
  if ($report.checks.Where({-not $_.ok}).Count -ne 0) { throw 'Standard-user runtime checks failed' }
  @{ok=$true;target='windows-x64';standardUser=$true;checks=$report.checks;os=[System.Environment]::OSVersion.VersionString} | ConvertTo-Json -Depth 8
} finally {
  if ($created) { Remove-LocalUser -Name $name -ErrorAction SilentlyContinue }
  if (Test-Path $root) { Remove-Item -LiteralPath $root -Recurse -Force }
  $password.Dispose()
}
