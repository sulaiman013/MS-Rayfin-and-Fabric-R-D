# Run a .sql file against the Fabric Warehouse, splitting on `GO` batch separators.
# Prints any result sets. Usage: python run_sql.py <file.sql>
import sys, re, pyodbc, wh

path = sys.argv[1]
sql = open(path, encoding="utf-8").read()
batches = [b.strip() for b in re.split(r'(?im)^\s*GO\s*$', sql) if b.strip()]

cn = wh.connect()
cur = cn.cursor()
for i, b in enumerate(batches, 1):
    try:
        cur.execute(b)
        while True:
            if cur.description:
                cols = [d[0] for d in cur.description]
                rows = cur.fetchall()
                print("  " + " | ".join(cols))
                for r in rows:
                    print("  " + " | ".join("NULL" if x is None else str(x) for x in r))
            if not cur.nextset():
                break
    except pyodbc.Error as e:
        print(f"[batch {i}] ERROR: {e}")
        print("---- batch was ----")
        print(b[:500])
        sys.exit(1)
print(f"OK ({len(batches)} batch(es))")
