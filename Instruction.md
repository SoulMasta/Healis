alisher@compute-vm-2-2-15-ssd-1773347516081:~$ docker logs backend

> server@1.0.0 start
> node index.js

[BOOT] index.js loading
[dotenv@17.2.3] injecting env (16) from .env -- tip: ⚙️  override existing env vars with { override: true }
[BOOT] dotenv done
[BOOT] requiring db
[BOOT] requiring models
[BOOT] models done
[BOOT] server port forced to 5000
[BOOT] calling start()
DB connected
[BOOT] start() entered
[LISTEN] Server listening on http://0.0.0.0:5000
alisher@compute-vm-2-2-15-ssd-1773347516081:~$ curl https://api.healis.ru/health
<html>
<head><title>404 Not Found</title></head>
<body>
<center><h1>404 Not Found</h1></center>
<hr><center>nginx/1.24.0 (Ubuntu)</center>
</body>
</html>
alisher@compute-vm-2-2-15-ssd-1773347516081:~$ curl https://api.healis.ru
<html>
<head><title>404 Not Found</title></head>
<body>
<center><h1>404 Not Found</h1></center>
<hr><center>nginx/1.24.0 (Ubuntu)</center>
</body>
</html>
alisher@compute-vm-2-2-15-ssd-1773347516081:~$ curl https://api.healis.ru/login
<html>
<head><title>404 Not Found</title></head>
<body>
<center><h1>404 Not Found</h1></center>
<hr><center>nginx/1.24.0 (Ubuntu)</center>
</body>
</html>
alisher@compute-vm-2-2-15-ssd-1773347516081:~$