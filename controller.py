from git import Repo

from loguru import logger as L

import os
import sys
import subprocess


class Controller:
    DEV_ENVIRONMENT_TIMEOUT = 60
    DEV_ENVIRONMENT_SUBMODULE_NAME = "dev-environment"

    def __init__(self):
        self._runtime_path = os.path.abspath(os.path.dirname(sys.argv[0]))
        self._repository_path = os.path.abspath(os.path.join(self._runtime_path, ".git"))

        self._repository = Repo(self._repository_path)

        self.update()

    def _update_repositories(self):
        L.debug("Pulling changes from environment repository")

        env_main_module = self._repository.submodule(self.DEV_ENVIRONMENT_SUBMODULE_NAME)

        try:
            env_main_module.update(to_latest_revision=True, init=True)
        except Exception as e:
            L.error(f"Failed to update environment repository, giving up: {e}")
            return

        env_submodules = env_main_module.module().submodules
        L.debug("Pulling {} submodules from environment repository".format(len(env_submodules)))

        env_submodule_list = []

        for env_submodule in env_submodules:
            try:
                env_submodule.update(to_latest_revision=True, init=True)
            except Exception as e:
                L.error(f"Failed to update submodule {env_submodule.name}, skipping: {e}")
                continue

            if env_submodule.module().head.commit.hexsha == env_submodule.hexsha:
                continue

            env_submodule_list.append(env_submodule)

        env_submodule_list = [
            "- {}: commit {} ({})".format(
                submodule.name,
                submodule.module().head.commit.hexsha,
                submodule.module().head.commit.message.splitlines()[0]
            ) for submodule in env_submodule_list
        ]

        L.info("Updated {} submodules".format(len(env_submodule_list)))
        L.debug("Pushing repository submodule pointer updates")

        try:
            self._repository.git.add(update=True)
            if self._repository.is_dirty():
                self._repository.index.commit(f"""
[META] [UPDATE] Update submodule pointers

This is an automated commit. The following submodules were updated:
{"\n".join(env_submodule_list)}
""".strip())
                origin.push()
        except Exception as e:
            L.error(f"Failed to push submodule pointer updates, giving up: {e}")
            return

        L.debug("Updated repository submodule pointers")

    def _is_compose_up(self) -> bool:
        process = subprocess.Popen(
            ["docker-compose", "ps"],
            cwd=self.DEV_ENVIRONMENT_PATH,
            stdout=subprocess.PIPE,
            stderr=subprocess.PIPE
        )

        process_stdout, process_stderr = process.communicate(timeout=self.DEV_ENVIRONMENT_TIMEOUT)
        process_return_code = process.wait(timeout=self.DEV_ENVIRONMENT_TIMEOUT)

        return process_return_code == 0 and b"Up" in process_stdout and not process_stderr

    def _start_compose(self):
        if self._is_compose_up():
            L.debug("Docker-based compose environment is already running")
            return

        L.debug("Starting Docker-based compose environment")

        process = subprocess.Popen(
            ["docker-compose", "up", "-d"],
            cwd=self.DEV_ENVIRONMENT_PATH,
            stdout=subprocess.DEVNULL,
            stderr=subprocess.DEVNULL
        )
        process_return_code = process.wait(timeout=self.DEV_ENVIRONMENT_TIMEOUT)

        if process_return_code != 0:
            L.error("Failed to start Docker-based compose environment, giving up")
            return

        L.debug("Started Docker-based compose environment, checking status")

        process = subprocess.Popen(
            ["docker-compose", "ps"],
            cwd=self.DEV_ENVIRONMENT_PATH,
            stdout=subprocess.PIPE,
            stderr=subprocess.PIPE
        )
        process_stdout, process_stderr = process.communicate(timeout=self.DEV_ENVIRONMENT_TIMEOUT)
        process_return_code = process.wait(timeout=self.DEV_ENVIRONMENT_TIMEOUT)

        if process_return_code != 0:
            L.error("Failed to check Docker-based compose environment status, giving up")
            return
        elif process_stderr:
            L.error(f"Failed to check Docker-based compose environment status, giving up: {process_stderr.decode().strip()}")
            return

        if b"Exit" in process_stdout:
            L.error("One or more containers in Docker-based compose environment are not running, giving up")
            return

        L.info("Docker-based compose environment is running and alive")

    def _stop_compose(self):
        if not self._is_compose_up():
            L.debug("Docker-based compose environment is not running")
            return

        L.debug("Stopping Docker-based compose environment")

        process = subprocess.Popen(
            ["docker-compose", "down"],
            cwd=self.DEV_ENVIRONMENT_PATH,
            stdout=subprocess.DEVNULL,
            stderr=subprocess.DEVNULL
        )

        process_return_code = process.wait(timeout=self.DEV_ENVIRONMENT_TIMEOUT)
        if process_return_code != 0:
            L.error("Failed to stop Docker-based compose environment, giving up")
            return

        L.debug("Stopped Docker-based compose environment")

    def _restart_compose(self):
        self._stop_compose()
        self._start_compose()

    def update(self):
        self._update_repositories()
        self._restart_compose()
