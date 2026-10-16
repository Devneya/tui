param(
  [Parameter(Mandatory=$true)][ValidateSet('add','remove')][string]$Mode,
  [Parameter(Mandatory=$true)][string]$RulePrefix,
  [string]$Candidate,
  [string]$Node
)
$ErrorActionPreference='Stop'
if ($RulePrefix -notmatch '^devneya-acceptance-[0-9a-f-]+$') { throw 'Invalid test rule prefix' }
if ($Mode -eq 'remove') {
  Get-NetFirewallRule -Name "$RulePrefix-*" -ErrorAction SilentlyContinue | Remove-NetFirewallRule
  exit 0
}
try {
  New-NetFirewallRule -Name "$RulePrefix-candidate" -DisplayName "$RulePrefix candidate" -Direction Outbound -Action Block -Program $Candidate -Profile Any | Out-Null
  New-NetFirewallRule -Name "$RulePrefix-node" -DisplayName "$RulePrefix Node" -Direction Outbound -Action Block -Program $Node -Profile Any | Out-Null
} catch {
  Get-NetFirewallRule -Name "$RulePrefix-*" -ErrorAction SilentlyContinue | Remove-NetFirewallRule
  throw
}
