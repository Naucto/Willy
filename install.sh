#!/bin/sh

SV_REPO_PATH="`dirname "$0"`"

SV_INSTALL_PATH="/opt/naucto-docker-synchronizer"
SV_INSTALL_DEFAULT_WEBHOOK_CERT_FNAME="webhook-cert"
SV_INSTALL_DEFAULT_WEBHOOK_CERT_PATH="$SV_INSTALL_PATH/$SV_INSTALL_DEFAULT_WEBHOOK_CERT_FNAME"
SV_INSTALL_DEFAULT_PUBLIC_CERT_FNAME="public-cert"
SV_INSTALL_DEFAULT_PUBLIC_CERT_PATH="$SV_INSTALL_PATH/$SV_INSTALL_DEFAULT_PUBLIC_CERT_FNAME"
SV_LOCK_PATH="$SV_REPO_PATH/.`basename "$0"`.lock"
SV_TEMP_PATH="$SV_REPO_PATH/.repo"

SV_SERVICE_USER="ndc"
SV_SERVICE_NAME="naucto-docker-synchronizer"
SV_SERVICE_PATH="/etc/systemd/system/$SV_SERVICE_NAME.service"
SV_SERVICE_SCRIPT_FNAME="service.sh"
SV_SERVICE_SCRIPT_PATH="$SV_INSTALL_PATH/$SV_SERVICE_SCRIPT_FNAME"
SV_SERVICE_ENV_FNAME=".config"
SV_SERVICE_ENV_PATH="$SV_INSTALL_PATH/$SV_SERVICE_ENV_FNAME"
SV_SERVICE_VENV_FNAME=".venv"
SV_SERVICE_VENV_PATH="$SV_INSTALL_PATH/$SV_SERVICE_VENV_FNAME"

SV_SERVICE_DOCKER_ENV_FNAME=".env"
SV_SERVICE_DOCKER_ENV_PATH="$SV_INSTALL_PATH/$SV_SERVICE_DOCKER_ENV_FNAME"

sv_require()
{
    tool_name="$1"
    error_message="$2"

    tool_path=`which "$tool_name" 2>&1`

    if [ $? -ne 0 ]; then
        echo "$0: Cannot find '$tool_name' on your system. $error_message" >&2
        # Note: As `` spawns a subshell, exit = return.
        exit 1
    fi

    echo $tool_path
}

sv_usage()
{
    echo "Usage: $0 [-h] [install|uninstall]" >&2
}

sv_question()
{
    question="$1"
    default_value="$2"
    variable_name="$3"

    echo -n "$question [$default_value]: " >&2
    read input_value

    [ -z "$input_value" ] && echo "$default_value" || echo "$input_value"
}

sv_try()
{
    why="$1"
    command="$2"

    tool_output="`sh -c "$command" 2>&1`"
    tool_status="$?"

    if [ "$tool_status" -ne 0 ]; then
        echo "$0: Failed to run '$command' (exit status $tool_status)"
        echo "The installer tried to: $why"
        echo "The command output: $tool_output"

        exit 1
    fi
}

sv_try_as()
{
    su_tool="$1"
    user="$2"
    why="$3"
    command="$4"

    sv_try "$why" "echo $command | $su_tool $user"
}

sv_lock()
{
    if [ -f "$SV_LOCK_PATH" ]; then
        cat >&2 <<EOF
$0: The installer lock file is already present.

Either another instance of this script is running, or the script has
prematurely stopped. If you are sure no other instance of this script is
running, you can delete the lock file with this command:

rm -f '$SV_LOCK_PATH'
EOF

        exit 1
    fi

    cp "$0" "$SV_LOCK_PATH"
}

sv_unlock()
{
    rm -f "$SV_LOCK_PATH"
}

sv_status_show()
{
   echo "$@... "
}

sv_action_install()
{
    cat >&2 <<EOF
This assistant will ask you a handful set of questions to install the service
and its components on this computer.

Default values are shown right besides the question. Press Enter if you want
to accept said default value, or type in the appropriate value if necessary.

The service requires the use of SSL certificates so that GitHub can contact it
through a webhook. Consequently, this requires an associated domain name for
this task.

Only change this value if you are not going to use auto-renewed
certification bots like certbot.

We recommend you use certbot to automatically generate keys for your domain
name, and keep them up-to-date.

The path must be a folder containing the following two files:

   - cert.pem, the public key exposed to end users/clients
   - privkey.pem, the private key used to encrypt responses to be decoded by
     end users/clients
EOF
    webhook_certificates_path="`sv_question "Where are the SSL public and private keys located?" \
                               "$SV_INSTALL_DEFAULT_WEBHOOK_CERT_PATH"`"

    if [ ! -d "$webhook_certificates_path" ] || \
       [ ! -f "$webhook_certificates_path/fullchain.pem" ] || \
       [ ! -f "$webhook_certificates_path/privkey.pem" ]; then
        echo "$0: Bad certificates path passed, cannot continue." >&2
        exit 1
    fi

    webhook_certificates_path="`realpath "$webhook_certificates_path"`"

    cat >&2 <<EOF

We also need certificates to serve the frontend and backend securely through
SSL.

EOF
    public_certificates_path="`sv_question "Where are the SSL public and private keys located?" \
                             "$SV_INSTALL_DEFAULT_PUBLIC_CERT_PATH"`"

    if [ ! -d "$public_certificates_path" ] || \
       [ ! -f "$public_certificates_path/fullchain.pem" ] || \
       [ ! -f "$public_certificates_path/privkey.pem" ]; then
        echo "$0: Bad certificates path passed, cannot continue." >&2
        exit 1
    fi

    # ---

    cat >&2 <<EOF

We now need to know the JWT secret to use when producing secure JWT
authentication strings.

This secret must be a long, random string that is kept private and secure.

EOF

    jwt_secret="`sv_question "What JWT secret should be used?" ""`"

    if [ -z "$jwt_secret" ]; then
        echo "$0: You must provide a JWT secret to continue." >&2
        exit 1
    fi

    jwt_expiry_time="`sv_question "What is the expiry time (Xy, Xm, Xd, Xm, Xs) of the generated JWT tokens?" "1d"`"

    if [ -z "$jwt_expiry_time" ]; then
        echo "$0: You must provide a JWT expiry time to continue." >&2
        exit 1
    fi

    # ---

    cat >&2 <<EOF

We now need the details of your Amazon Web Services (AWS) account and of your
S3 bucket so that the backend can store the actual users' projects.

EOF

    aws_access_key_id="`sv_question "What is your AWS access key ID?" ""`"

    if [ -z "$aws_access_key_id" ]; then
        echo "$0: You must provide an AWS access key ID to continue." >&2
        exit 1
    fi

    aws_secret_access_key="`sv_question "What is your AWS secret access key?" ""`"

    if [ -z "$aws_secret_access_key" ]; then
        echo "$0: You must provide an AWS secret access key to continue." >&2
        exit 1
    fi

    aws_region="`sv_question "What is your AWS region?" "us-east-1"`"

    if [ -z "$aws_region" ]; then
        echo "$0: You must provide an AWS region to continue." >&2
        exit 1
    fi

    aws_bucket_name="`sv_question "What is your AWS S3 bucket name?" ""`"

    if [ -z "$aws_bucket_name" ]; then
        echo "$0: You must provide an AWS S3 bucket name to continue." >&2
        exit 1
    fi

    # ---

    cat >&2 <<EOF

We now need some machine-specific info regarding the PostgreSQL's database, so
that the backend can use it to store the users' miscellaneous data.

EOF

    db_username="`head /dev/urandom | tr -dc A-Za-z0-9 | head -c 16`"
    db_username="`sv_question "Enter the database username to use" "$db_username"`"

    db_password="`head /dev/urandom | tr -dc A-Za-z0-9 | head -c 32`"
    db_password="`sv_question "Enter a secure database password for this instance" "$db_password"`"

    db_name="`head /dev/urandom | tr -dc A-Za-z0-9 | head -c 16`"
    db_name="`sv_question "Enter the database name to use" "$db_name"`"

    # ---

    cat >&2 <<EOF

We also need a JSON configuration file for the frontend, which describes the
available proxy peer nodes to use for end users.

EOF

    frontend_config_path="`sv_question "Where is the frontend configuration file located?" "/opt/naucto-docker/synchronizer/frontend-config.json"`"

    # ---

    cat >&2 <<EOF

Everything has been collected and the service is now being installed and
configured.

The service will be installed to '$SV_INSTALL_PATH'.

EOF

    sv_status_show "Setting-up a dedicated service user for systemd"

    if ! id -u "$SV_SERVICE_USER" >/dev/null 2>/dev/null; then
        sv_try "Create a dedicated service user" \
               "$tool_useradd -m $SV_SERVICE_USER"
    fi

    sv_status_show "Adding the dedicated service user to the 'docker' group"

    sv_try "Add the service user to the 'docker' group so that it can manage Docker containers" \
           "usermod -aG docker $SV_SERVICE_USER"

    sv_status_show "Downloading service repository and installing it in $SV_INSTALL_PATH"

    if [ -d "$SV_TEMP_PATH" ]; then
        sv_try "Remove the old service repository from the temporary path." \
               "rm -rf '$SV_TEMP_PATH'"
    fi

    sv_try_as "$tool_su" "$sv_repo_userowner" "Clone the service repository to a temporary path." \
              "$tool_git clone '$sv_repo_url' '$SV_TEMP_PATH'"

    if [ -d "$SV_INSTALL_PATH" ]; then
        sv_try "Duplicate the cloned repository to the installation path." \
               "cp -rf '$SV_TEMP_PATH'/* '$SV_TEMP_PATH/.git' '$SV_INSTALL_PATH'"
        sv_try "Remove the old service repository from the temporary path." \
               "rm -rf '$SV_TEMP_PATH'"
    else
        sv_try "Move the cloned repository to the installation path." \
               "mv '$SV_TEMP_PATH' '$SV_INSTALL_PATH'"
    fi

    sv_status_show "Installing the systemd service file"

    cat >"$SV_SERVICE_PATH" <<EOF
[Unit]
Description=Naucto Docker Synchronizer Service
After=network.target
ConditionPathExists=$SV_INSTALL_PATH

[Service]
User=$SV_SERVICE_USER
EnvironmentFile=$SV_SERVICE_ENV_PATH
ExecStart=$SV_SERVICE_SCRIPT_PATH
Restart=on-failure

[Install]
WantedBy=network.target
EOF

    sv_status_show "Installing the service environment file"

    cat >"$SV_SERVICE_ENV_PATH" <<EOF
LOGURU_LEVEL=INFO

CW_HOST=1
CW_HOST_CERT=$webhook_certificates_path
EOF

    sv_status_show "Installing the Docker environment file"

    cat >"$SV_SERVICE_DOCKER_ENV_PATH" <<EOF
POSTGRES_USER=$db_username
POSTGRES_PASSWORD=$db_password
POSTGRES_DB=$db_name
POSTGRES_HOST=db
POSTGRES_PORT=5432

FRONTEND_PORT=80
FRONTEND_CONFIG_PATH=$frontend_config_path
BACKEND_PORT=1987
NODE_ENV=production

JWT_SECRET=$jwt_secret
JWT_EXPIRES_IN=$jwt_expiry_time
AWS_ACCESS_KEY_ID=$aws_access_key_id
AWS_SECRET_ACCESS_KEY=$aws_secret_access_key
AWS_REGION=$aws_region
S3_BUCKET_NAME=$aws_bucket_name

SSL_TARGET_DOMAIN=$target_domain
SSL_CERTS_PATH=$public_certificates_path
EOF

    sv_status_show "Installing the service script file"

    cat >"$SV_SERVICE_SCRIPT_PATH" <<EOF
#!/bin/sh

SV_INSTALL_PATH="\`dirname "\$0"\`"
SV_ENV_PATH="$SV_SERVICE_VENV_PATH"

. "\$SV_ENV_PATH/bin/activate"

python3 -B "$SV_INSTALL_PATH/main.py"
EOF
    chmod +x "$SV_INSTALL_PATH/service.sh"

    sv_status_show "Initializing the Python virtual environment"

    sv_try "Initialize a virtual Python environment in the installation path." \
           "$tool_python -m venv $SV_SERVICE_VENV_PATH"

    sv_try "Install dependencies in the virtual Python environment." \
           ". $SV_SERVICE_VENV_PATH/bin/activate && pip install -r '$SV_INSTALL_PATH/requirements.txt'"

    sv_try "Add a certificates folder for auto-renewing certificate bots." \
           "mkdir -p '$SV_INSTALL_DEFAULT_WEBHOOK_CERT_PATH' && \
            mkdir -p '$SV_INSTALL_DEFAULT_PUBLIC_CERT_PATH'"

    

    sv_status_show "Configuring filesystem permissions"

    sv_try "Set ownership of the service installation location to $SV_SERVICE_USER:root." \
           "chown -R '$SV_SERVICE_USER:root' '$SV_INSTALL_PATH'"
    sv_try "Set permissions of the service installation location." \
           "chmod -R 700 '$SV_INSTALL_PATH'"

    sv_status_show "Notifying systemd that a new service has been installed"

    sv_try "Notify systemd that we have installed a new service." \
           "$tool_systemctl daemon-reload"

    sv_status_show "Configuring and starting up the service"

    sv_try "Enable the service to automatically start at boot-up." \
           "$tool_systemctl enable $SV_SERVICE_NAME"
    sv_try "Start the service on the machine." \
           "$tool_systemctl start $SV_SERVICE_NAME"

    sv_status_show "Waiting for the service to boot-up"
    sleep 6

    sv_try "Check if the service is alive and well on the machine." \
           "$tool_systemctl is-active $SV_SERVICE_NAME"

    cat >&2 <<EOF

Congratulations! The Naucto Docker Synchronizer service is now up and running on
your machine.

You may update or uninstall this service by using this installer script again
with a different verb, in the installation location or where you just executed
this script.

Report any issues here: https://github.com/Naucto/Docker-Synchronizer/issues

We hope that it will satisfy you, just as much as it satisfies us! :]
EOF
}

sv_action_update()
{
    if [ ! -f "$SV_SERVICE_ENV_PATH" ]; then
        echo "$0: The service is not installed on this system."
        exit 1
    fi

    sv_status_show "Stopping the executing service if it is still running"
    $tool_systemctl stop "$SV_SERVICE_NAME" >/dev/null 2>/dev/null

    sv_status_show "Saving virtual Python environment and settings"
    save_dir_path="`mktemp -d`"
    if [ -z "$save_dir_path" ]; then
        echo "$0: Failed to create a temporary path to save the virtual environment and settings, cannot continue."
        exit 1
    fi

    cp -r "$SV_SERVICE_ENV_PATH" \
          "$SV_SERVICE_VENV_PATH" \
          "$SV_SERVICE_SCRIPT_PATH" \
          "$SV_INSTALL_DEFAULT_CERT_PATH" \
          "$save_dir_path"

    sv_status_show "Cleaning-up old installation directory"
    sv_try "Clean old installation directory to prepare new installation. Settings and virtual environment are located at '$save_dir_path'." \
           "rm -rf '$SV_INSTALL_PATH'"

    sv_status_show "Downloading service repository and copying it in $SV_INSTALL_PATH"

    sv_try_as "$tool_su" "$sv_repo_userowner" "Clone the service repository to a temporary path." \
              "$tool_git clone '$sv_repo_url' '$SV_TEMP_PATH'"

    sv_try "Move the cloned repository to the installation path" \
           "mv '$SV_TEMP_PATH' '$SV_INSTALL_PATH'"

    sv_status_show "Moving back the virtual Python environment and settings"

    sv_try "Move back the virtual Python environment and settings in the installation location." \
           "mv '$save_dir_path/$SV_SERVICE_ENV_FNAME' '$SV_SERVICE_ENV_PATH' && \
            mv '$save_dir_path/$SV_SERVICE_VENV_FNAME' '$SV_SERVICE_VENV_PATH' && \
            mv '$save_dir_path/$SV_SERVICE_SCRIPT_FNAME' '$SV_SERVICE_SCRIPT_PATH' && \
            mv '$save_dir_path/$SV_SERVICE_MAPPING_FNAME' '$SV_SERVICE_MAPPING_PATH' && \
            mv '$save_dir_path/$SV_INSTALL_DEFAULT_CERT_FNAME' '$SV_INSTALL_DEFAULT_CERT_PATH'"
    sv_try "Remove temporary directory that contained the virtual Python environment and settings." \
           "rm -rf '$save_dir_path'"

    sv_status_show "Updating the virtual Python environment"

    sv_try "Update dependencies in the virtual Python environment." \
           ". $SV_SERVICE_VENV_PATH/bin/activate && pip install -r '$SV_INSTALL_PATH/requirements.txt'"

    sv_status_show "Starting back the service"

    sv_try "Start the service back after updating it" \
           "$tool_systemctl start '$SV_SERVICE_NAME'"
    sv_try "Check if the service is alive and well on the machine." \
           "$tool_systemctl is-active $SV_SERVICE_NAME"

    cat <<EOF

Done updating the service, and now back online!

Report any issues here: https://github.com/Naucto/Repository-Crawler/issues
EOF
}

sv_action_uninstall()
{
    if [ ! -f "$SV_SERVICE_ENV_PATH" ]; then
        cat >&2 <<EOF
NOTE: The service is not installed on this system. We'll still allow you to
proceed to the uninstallation if you have remnants, but please report issues
like this. A link will be available at the end of the process.

EOF
    fi

    cat >&2 <<EOF
ATTENTION! You are about to uninstall the Docker Synchronizer service. All
files and the associated service user will be removed from this machine.

EOF
    uninstall_question="`sv_question "Type in 'UNINSTALL' without quotes, all caps to confirm" \
                         ""`"

    if [ "$uninstall_question" != "UNINSTALL" ]; then
        echo "$0: Question unanswered incorrectly, cancelling." >&2
        exit 1
    fi

    echo

    sv_status_show "Stopping the executing service if it is still running and disable it"
    $tool_systemctl stop "$SV_SERVICE_NAME" >/dev/null 2>/dev/null
    $tool_systemctl disable "$SV_SERVICE_NAME" >/dev/null 2>/dev/null

    sv_status_show "Uninstalling service software & system files"
    rm -rf "$SV_INSTALL_PATH" "$SV_SERVICE_PATH"

    sv_status_show "Reloading systemd daemon"
    sv_try "Notify systemd that we have removed a service." \
           "$tool_systemctl daemon-reload"

    sv_status_show "Removing service user"
    $tool_userdel --remove "$SV_SERVICE_USER" >/dev/null 2>/dev/null

    cat >&2 <<EOF

Done uninstalling the repository crawler service. Goodbye world! :]

Report any issues here: https://github.com/Naucto/Repository-Crawler/issues
EOF
}

# ---

if [ "$(id -u)" -ne 0 ]; then
    echo "$0: This script requires administrative privileges." >&2
    exit 1
fi

cd "$SV_REPO_PATH"

tool_git="`sv_require git "This installer uses Git to keep this software up-to-date. Please install it."`"
tool_systemctl="`sv_require systemctl "This installer does not support non-systemd environments."`"
tool_su="`sv_require su "This installer requires to switch back-and-forth between a regular & root account to e.g. update the service."`"
tool_python="`sv_require python3 "The service requires Python 3.11+ along with venv + pip support to run on this machine"`"
tool_useradd="`sv_require useradd "The service requires a user to be created when installing"`"
tool_userdel="`sv_require userdel "The service requires a user to be deleted when uninstalling"`"

[ -z "$tool_git" ] || \
[ -z "$tool_systemctl" ] || \
[ -z "$tool_su" ] || \
[ -z "$tool_python" ] || \
[ -z "$tool_useradd" ] || \
[ -z "$tool_userdel" ] && exit 1

sv_status_show "Determining installation source repository user owner"
sv_repo_userowner="`stat -c "%U" "$SV_REPO_PATH/.git" 2>/dev/null`"

if [ -z "$sv_repo_userowner" ]; then
    cat >&2 <<EOF
$0: Failed to determine the ownership of the repository, cannot continue.

If you have downloaded the repository through the .zip file, please proceed
again by cloning the repository instead. This allows the installer and the
service to update itself when necessary.
EOF
    exit 1
fi

sv_repo_url="`"$tool_git" config --get remote.origin.url 2>/dev/null`"

if [ -z "$sv_repo_url" ]; then
    cat >&2 <<EOF
$0: Failed to get the remote origin URL of the repository, cannot continue.

If you have downloaded the repository through the .zip file, please proceed
again by cloning the repository instead. This allows the installer and the
service to update itself when necessary.
EOF
    exit 1
fi

sv_lock

sv_status_show "Checking for updates on the repository"
sv_try_as "$tool_su" "$sv_repo_userowner" "Attempt to pull the tool's repository to keep the installer up-to-date" \
          "$tool_git pull"

sv_try "Check if the installer has changed. Please reload the script." \
       "diff '$0' '$SV_LOCK_PATH'"

sv_unlock

cat <<EOF

Naucto Docker Synchronizer service installer script
Copyright (C) 2025 Naucto - Under the MIT license. See license.txt for more details.

EOF

if [ "$#" -ne 1 ]; then
    sv_usage
    exit 1
fi

primary_command="$1"
shift 1

if [ "$primary_command" = "-h" ]; then
    cat >&2 <<EOF
Utility to setup the Naucto Docker Synchronizer service on a systemd-based
system.

EOF

    sv_usage
   
    cat >&2 <<EOF
Options:

    -h              Show a help message describing the available options

Commands:

    install         Install the Naucto Docker Synchronizer as a systemd-based
                    service on the current system.
                    This will duplicate the contents of the repository to the
                    installation path, create a systemd service file for it
                    and ask the user a few questions to configure it

    update          Performs an unconditionnal update to the service.
                    This fetches a new copy of the repository and installs it
                    without losing the specified settings during installation.
                    This verb can also be used to repair an installation if
                    it broke in most situations.

    uninstall       Remove the aforementioned service from the system.
EOF

    exit 1
fi

case "$primary_command" in
    install)
        sv_action_install $@
        exit $?
        ;;

    update)
        sv_action_update $@
        exit $?
        ;;

    uninstall)
        sv_action_uninstall $@
        exit $?
        ;;

    *)
        echo "$0: Action '$primary_command' does not exist." >&2
        exit 1
        ;;
esac
