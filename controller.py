from git import Repo

from loguru import logger as L

import os
import subprocess


class Controller:
    DEV_ENVIRONMENT_PATH = "dev_environment"
    DEV_ENVIRONMENT_TIMEOUT = 60

    def __init__(self):
        try:
            self._repository = Repo(os.path.join(os.getcwd(), self.DEV_ENVIRONMENT_PATH, ".git"))
        except Exception as e:
            L.error(f"Failed to load environment repository, giving up: {e}")
            return

        self.update()

    def _update_repositories(self):
        L.debug("Pulling changes from environment repository")

        try:
            origin = self._repository.remote(name='origin')
            origin.pull()
        except Exception as e:
            L.error(f"Failed to update environment repository, giving up: {e}")
            return

        L.debug("Pulling changes from {} repository submodules".format(len(self._repository.submodules)))

        submodule_update_list = []

        for submodule in self._repository.submodules:
            try:
                submodule.update(to_latest_revision=True, init=True)
            except Exception as e:
                L.error(f"Failed to update submodule {submodule.name}, skipping: {e}")
                continue

            if submodule.module().head.commit.hexsha == submodule.hexsha:
                continue

            submodule_update_list.append(submodule)

        submodule_update_list = [
            "- {}: commit {} ({})".format(
                submodule.name,
                submodule.module().head.commit.hexsha,
                submodule.module().head.commit.message.splitlines()[0]
            ) for submodule in submodule_update_list
        ]

        L.info("Updated {} submodules".format(len(submodule_update_list)))
        L.debug("Pushing repository submodule pointer updates")

        try:
            self._repository.git.add(update=True)
            if self._repository.is_dirty():
                self._repository.index.commit(f"""
[META] [UPDATE] Update submodule pointers

This is an automated commit. The following submodules were updated:
{"\n".join(submodule_update_list)}
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
