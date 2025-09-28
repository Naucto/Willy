#!/usr/bin/env python3.13

from loguru import logger as L
import trio

from hosting import WebhookListener

from controller import Controller

from typing import Optional
import os


L.info("Hello, world from Naucto's Docker Synchronizer!")

env_set = {}

for env_var_name, global_var_name in env_set.items():
    env_var_value = os.getenv(env_var_name)

    if env_var_value is None:
        L.error(f"Environment variable {env_var_name} is not set.")
        exit(1)

    globals()[global_var_name] = env_var_value

host = bool(os.getenv("CW_HOST", None))
host_cert = os.getenv("CW_HOST_CERT", None)

if host: # type: ignore
    L.info("Starting as a self-sustaining updater through a webhook endpoint.")

try:
    controller = Controller()
except Exception as e:
    L.error(f"Error while instanciating controller: {e}")
    exit(1)

if host: # type: ignore
    resolved_host_cert: Optional[tuple[str, str]] = None

    if host_cert:
        host_cert_base = os.path.join(host_cert, "fullchain.pem")
        host_cert_key  = os.path.join(host_cert, "privkey.pem")
        resolved_host_cert = (host_cert_base, host_cert_key)
    else:
        L.warning("No HTTPS certificate path provided. The service will not be secure.")

    listener = WebhookListener(controller, host_cert=resolved_host_cert)
    listener.run()
else:
    controller.update()
