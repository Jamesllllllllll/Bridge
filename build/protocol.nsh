; Register chart links during installation, including silent installs. The
; Electron runtime also refreshes this association when Bridge is launched.
!macro customInstall
  WriteRegStr SHCTX "Software\Classes\bridge" "" "URL:Bridge chart link"
  WriteRegStr SHCTX "Software\Classes\bridge" "URL Protocol" ""
  WriteRegStr SHCTX "Software\Classes\bridge\DefaultIcon" "" "$appExe,0"
  WriteRegStr SHCTX "Software\Classes\bridge\shell\open\command" "" '"$appExe" "%1"'
!macroend

!macro customUnInstall
  ; Leave a different application's protocol registration alone.
  ReadRegStr $0 SHCTX "Software\Classes\bridge\shell\open\command" ""
  ${If} $0 == '"$INSTDIR\${APP_EXECUTABLE_FILENAME}" "%1"'
    DeleteRegKey SHCTX "Software\Classes\bridge"
  ${EndIf}
!macroend
