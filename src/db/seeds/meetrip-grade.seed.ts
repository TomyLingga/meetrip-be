async function main() {
  console.log('Master grade dikelola oleh Portal SSO. Seed lokal ref_grade dilewati.')
  process.exit(0)
}

main().catch((err) => {
  console.error(err)
  process.exit(1)
})

export {}
