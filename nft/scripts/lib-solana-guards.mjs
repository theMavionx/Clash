export function buildSolanaGuardConfig(deployment, umiFns) {
  const { dateTime, lamports, none, publicKey, some } = umiFns;
  const startDate = deployment.startDate || null;
  const startDateGuard = startDate ? some({ date: dateTime(startDate) }) : none();
  const groups = [];

  if (deployment.paymentGroups?.sol) {
    groups.push({
      label: 'sol',
      guards: {
        solPayment: some({
          lamports: lamports(BigInt(deployment.paymentGroups.sol.lamports)),
          destination: publicKey(deployment.paymentGroups.sol.destination),
        }),
        startDate: startDateGuard,
      },
    });
  }

  for (const label of ['usdc', 'skr', 'clash']) {
    const group = deployment.paymentGroups?.[label];
    if (!group) continue;
    const paymentGuard = String(group.tokenProgram || group.program || '').toLowerCase().includes('2022')
      ? 'token2022Payment'
      : 'tokenPayment';
    groups.push({
      label,
      guards: {
        [paymentGuard]: some({
          amount: BigInt(group.amount),
          mint: publicKey(group.mint),
          destinationAta: publicKey(group.destinationAta),
        }),
        startDate: startDateGuard,
      },
    });
  }

  if (groups.length > 0) {
    return {
      guards: {
        startDate: startDateGuard,
      },
      groups,
    };
  }

  return {
    guards: {
      solPayment: some({
        lamports: lamports(BigInt(deployment.priceLamports || '0')),
        destination: publicKey(deployment.treasury),
      }),
      startDate: startDateGuard,
    },
    groups: [],
  };
}
