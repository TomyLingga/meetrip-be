async function main() {
  console.log('Master grade dikelola oleh Portal SSO. Gunakan endpoint /api/master/ref-grade untuk melihat data grade.')
  process.exit(0)
}

main().catch((err) => {
  console.error(err)
  process.exit(1)
})

export {}
