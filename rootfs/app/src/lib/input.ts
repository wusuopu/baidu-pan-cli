import readline from 'readline'

const input = (text: string = ''): Promise<string> => {
  const rl = readline.createInterface({
    input: process.stdin,
    output: process.stdout
  });
  return new Promise((resolve) => {
    rl.question(text, (ret) => {
      rl.close()
      resolve(ret)
    })
  })
}
export default input;
