update app_user
set password_hash = case username
  when 'admin' then 'pbkdf2_sha256$210000$XVYLS0NRfyZVTajKaLEThg$QgZeGzz7pm2Myx0xBFYkPbf23yP1m6SbkvNplKJ8Nn0'
  when 'qc' then 'pbkdf2_sha256$210000$cBGUGpjt2rz2GkO4Ts4b3g$xQOjr1G2Rdf06adxAc_nPYqhQP5WlCOzUcGueHsc_F8'
  when 'service' then 'pbkdf2_sha256$210000$I_myQG3ny0jQiMcRXsR56A$hFLJpTV46ccZCjUWOFtAMIzidRJfsmrchETzH0x4-gM'
  else password_hash
end
where username in ('admin', 'qc', 'service')
  and password_hash not like 'pbkdf2_sha256$%';
