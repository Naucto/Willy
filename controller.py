from git import Repo

from loguru import logger as L

import os
import sys
import subprocess


class Controller:
    DEV_ENVIRONMENT_TIMEOUT = 3600
    DEV_ENVIRONMENT_SUBMODULE_NAME = "dev-environment"
    DEV_ENVIRONMENT_BRANCH_NAME = "main"

    def __init__(self):
        self._runtime_path = os.path.abspath(os.path.dirname(sys.argv[0]))
        self._repository_path = os.path.abspath(os.path.join(self._runtime_path, ".git"))

        self._repository = Repo(self._repository_path)

    def _update_repositories(self):
        submodule_list = [*self._repository.submodules]
        submodule_commit_desc = ""

        while submodule_list:
            submodule = submodule_list.pop(0)

            submodule.update(init=True, recursive=False)
            L.debug(f"Initialized submodule '{submodule.name}'")

            submodule_list.extend(submodule.module().submodules)
            L.trace(f"Queued {len(submodule.module().submodules)} submodules from '{submodule.name}'")

            subrepo = submodule.module()

            subrepo.git.fetch("--prune", "origin")
            L.trace(f"Fetched updates for submodule '{submodule.name}'")

            subrepo.git.checkout("origin/HEAD")
            L.debug(f"Updated submodule '{submodule.name}' to commit {subrepo.head.commit.hexsha}")

            submodule_commit_desc += "- {}: commit {} ({})\n".format(
                submodule.name,
                submodule.module().head.commit.hexsha,
                submodule.module().head.commit.message.splitlines()[0]
            )

        try:
            env_main_module = self._repository.submodule(self.DEV_ENVIRONMENT_SUBMODULE_NAME)
            L.trace(f"Located environment submodule '{self.DEV_ENVIRONMENT_SUBMODULE_NAME}'")

            env_main_module_repo = env_main_module.module()
            L.trace("Located environment repository")
        except Exception as e:
            L.error(f"Failed to update environment repository, giving up: {e}")
            return

        L.debug("Pushing repository submodule pointer updates")

        try:
            if env_main_module_repo.head.is_detached:
                env_main_module_repo.git.checkout(self.DEV_ENVIRONMENT_BRANCH_NAME)
                L.debug("Checked out local repo as we're working with a detached head")

            env_main_module_repo.git.add(update=True)

            if env_main_module_repo.is_dirty():
                env_main_module_repo.index.commit(f"""
[META] [UPDATE] Update submodule pointers

This is an automated commit. The following submodules were updated:
{submodule_commit_desc}
""".strip())
                L.debug("Prepared commit for updated submodule pointers")

                env_main_module_origin = env_main_module_repo.remote()

                env_main_module_origin.push()
                L.debug("Pushed updated submodule pointers")
            else:
                L.debug("No submodule pointer updates to commit")
        except Exception as e:
            L.error(f"Failed to push submodule pointer updates, giving up: {e}")
            return

        L.debug("Updated repository submodule pointers")

    def _is_compose_up(self) -> bool:
        process = subprocess.Popen(
            ["docker-compose", "ps"],
            cwd=self._runtime_path,
            stdout=subprocess.PIPE,
            stderr=subprocess.PIPE,
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
            cwd=self._runtime_path,
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
            cwd=self._runtime_path,
            stdout=subprocess.PIPE,
            stderr=subprocess.PIPE
        )
        process_stdout, process_stderr = process.communicate(timeout=self.DEV_ENVIRONMENT_TIMEOUT)
        process_return_code = process.wait(timeout=self.DEV_ENVIRONMENT_TIMEOUT)

        if process_return_code != 0:
            L.error(f"Failed to check Docker-based compose environment status, giving up (error code {process_return_code}")
            return
        elif process_stderr:
            L.error(f"Failed to check Docker-based compose environment status, giving up: {process_stderr.decode().strip()}")
            return

        if b"Exit" in process_stdout:
            L.error("One or more containers in Docker-based compose environment are not running, giving up")
            return

        L.info("Docker-based compose environment is running and alive")

    def _build_compose(self):
        if self._is_compose_up():
            L.debug("Docker-based compose is running, we need to stop it first before building")
            self._stop_compose()

        L.debug("Building Docker-based compose")

        process = subprocess.Popen(
            ["docker-compose", "build"],
            stdout=subprocess.PIPE,
            stderr=subprocess.PIPE
        )
        process_stdout, process_stderr = process.communicate(timeout=self.DEV_ENVIRONMENT_TIMEOUT)
        process_return_code = process.wait(timeout=self.DEV_ENVIRONMENT_TIMEOUT)

        if process_return_code != 0:
            L.error(f"Failed to build Docker-based compose, giving up (error code {process_return_code}")
            L.error(process_stderr)
            return

        L.info("Docker-based compose built successfully")

    def _stop_compose(self):
        if not self._is_compose_up():
            L.debug("Docker-based compose environment is not running")
            return

        L.debug("Stopping Docker-based compose environment")

        process = subprocess.Popen(
            ["docker-compose", "down"],
            cwd=self._runtime_path,
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

    def _prune_system(self):
        L.debug("Pruning Docker to free up some space")

        process = subprocess.Popen(
            ["docker", "system", "prune", "-f"],
            stdout=subprocess.PIPE,
            stderr=subprocess.PIPE
        )
        process_stdout, process_stderr = process.communicate(timeout=self.DEV_ENVIRONMENT_TIMEOUT)
        process_return_code = process.wait(timeout=self.DEV_ENVIRONMENT_TIMEOUT)

        if process_return_code != 0:
            L.error(f"Failed to prune Docker, giving up (error code {process_return_code}")
            return
        elif process_stderr:
            L.error(f"Failed to prune Docker, giving up: {process_stderr.decode().strip()}")
            return

        L.info("Docker pruned successfully")

    def update(self):
        self._update_repositories()
        self._prune_system()
        self._build_compose()
        self._restart_compose()
