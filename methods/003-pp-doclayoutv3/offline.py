"""Apply and verify OS-level network restrictions before loading inference libraries."""
import ctypes
import ctypes.util
import errno
import os
from pathlib import Path
import socket
import sys

PROFILE = "(version 1) (allow default) (deny network*)"


def linux_filter():
    library = ctypes.util.find_library("seccomp")
    if not library:
        raise RuntimeError("libseccomp is required for the Linux network restriction.")
    lib = ctypes.CDLL(library, use_errno=True)
    lib.seccomp_init.argtypes = [ctypes.c_uint32]
    lib.seccomp_init.restype = ctypes.c_void_p
    lib.seccomp_syscall_resolve_name.argtypes = [ctypes.c_char_p]
    lib.seccomp_syscall_resolve_name.restype = ctypes.c_int
    lib.seccomp_rule_add.argtypes = [ctypes.c_void_p, ctypes.c_uint32, ctypes.c_int, ctypes.c_uint]
    lib.seccomp_load.argtypes = [ctypes.c_void_p]
    lib.seccomp_release.argtypes = [ctypes.c_void_p]
    ctx = lib.seccomp_init(0x7fff0000)
    if not ctx:
        raise RuntimeError("Could not initialize the network restriction.")
    try:
        for name in [b"socket", b"connect", b"sendto", b"sendmsg", b"sendmmsg"]:
            number = lib.seccomp_syscall_resolve_name(name)
            if number >= 0 and lib.seccomp_rule_add(ctx, 0x00050000 | errno.EPERM, number, 0) != 0:
                raise RuntimeError("Could not restrict " + name.decode())
        if lib.seccomp_load(ctx) != 0:
            raise RuntimeError("Could not install the network restriction.")
    finally:
        lib.seccomp_release(ctx)


def enter_network_sandbox():
    os.environ["ORT_DISABLE_TELEMETRY"] = "1"
    if sys.platform == "darwin":
        if os.environ.get("SCAN_TEST_NETWORK_SANDBOX") != "macos":
            executable = "/usr/bin/sandbox-exec"
            if not Path(executable).is_file():
                raise RuntimeError("sandbox-exec is required on macOS.")
            environment = dict(os.environ, SCAN_TEST_NETWORK_SANDBOX="macos")
            os.execve(executable, [executable, "-p", PROFILE, sys.executable, *sys.argv], environment)
        backend = "macOS sandbox-exec: deny network*"
    elif sys.platform.startswith("linux"):
        linux_filter()
        backend = "Linux seccomp: deny socket/connect/send syscalls"
    else:
        raise RuntimeError("This runner requires macOS sandbox-exec or Linux libseccomp.")

    probes = []
    for family, address in [(socket.AF_INET, ("127.0.0.1", 9)), (socket.AF_INET6, ("::1", 9))]:
        for kind in [socket.SOCK_STREAM, socket.SOCK_DGRAM]:
            operations = ["connect", "sendto"] if kind == socket.SOCK_DGRAM else ["connect"]
            for operation in operations:
                try:
                    connection = socket.socket(family, kind)
                except OSError as error:
                    if error.errno not in (errno.EPERM, errno.EACCES):
                        raise
                    probes.append({"family": family.name, "type": kind.name,
                                   "operation": "socket", "errno": error.errno})
                    continue
                with connection:
                    connection.settimeout(1)
                    try:
                        if operation == "connect":
                            connection.connect(address)
                        else:
                            connection.sendto(b"", address)
                    except OSError as error:
                        if error.errno not in (errno.EPERM, errno.EACCES):
                            raise RuntimeError("Network denial verification failed.") from error
                        probes.append({"family": family.name, "type": kind.name,
                                       "operation": operation, "errno": error.errno})
                    else:
                        raise RuntimeError("Network access was allowed; stopping before inference.")
    return {"backend": backend, "verified_probes": probes}
