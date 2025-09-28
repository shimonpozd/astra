import subprocess
import os

# List of ports used by the microservices
PORTS = ["7010", "7020", "7030", "7040", "7050", "7060", "7099"]

def stop_services():
    print("Stopping services by terminating processes on specific ports...")
    found_processes = False
    try:
        # Get the output of netstat
        result = subprocess.check_output(["netstat", "-aon"], text=True, encoding='utf-8')
        lines = result.strip().split('\n')
        
        pids_to_kill = set()

        for port in PORTS:
            for line in lines:
                if f":{port}" in line and "LISTENING" in line:
                    try:
                        parts = line.split()
                        pid = parts[-1]
                        if pid != "0":
                            pids_to_kill.add(pid)
                    except (IndexError, ValueError):
                        continue # Ignore malformed lines
        
        if not pids_to_kill:
            print("No running services found on the specified ports.")
            return

        print(f"Found processes to terminate (PIDs): {list(pids_to_kill)}")
        for pid in pids_to_kill:
            try:
                print(f"Terminating process with PID: {pid}...", end='')
                # Forcefully terminate the process
                subprocess.run(["taskkill", "/PID", pid, "/F"], check=True, capture_output=True)
                print(" Success.")
                found_processes = True
            except subprocess.CalledProcessError as e:
                # The process might have already been terminated
                print(f" Failed. It might have already been stopped. Error: {e.stderr}")

    except FileNotFoundError:
        print("Error: 'netstat' or 'taskkill' command not found. Make sure you are running on Windows.")
    except Exception as e:
        print(f"An unexpected error occurred: {e}")

    if found_processes:
        print("\nAll targeted services should be stopped.")
    else:
        print("\nNo services were terminated.")

if __name__ == "__main__":
    stop_services()
