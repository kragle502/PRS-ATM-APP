import React from 'react';
import { observer, useLocalStore } from 'mobx-react-lite';
import { useStore } from 'store';
import { Finance, PrsAtm, sleep } from 'utils';
import classNames from 'classnames';
import Loading from 'components/Loading';
import WithdrawModal from './WithdrawModal';
import { add, equal, bignumber } from 'mathjs';
import CountUp from 'react-countup';
import { useHistory } from 'react-router-dom';

interface IAssetProps {
  asset: IAsset;
  onRecharge: (currency: string) => void;
  onWithdraw: (currency: string) => void;
  hideBorder?: boolean;
}

type IAsset = [string, string];

const Asset = (props: IAssetProps) => {
  const currency = props.asset[0];
  const amount = props.asset[1];

  return (
    <div
      className={classNames(
        {
          'border-b border-gray-ec': !props.hideBorder,
        },
        'flex items-center justify-between p-3 leading-none'
      )}
    >
      <div className="flex items-center">
        <div className="w-10 h-10">
          <img
            className="w-10 h-10"
            src={
              Finance.currencyIconMap[currency] || Finance.defaultCurrencyIcon
            }
            alt={currency}
          />
        </div>
        <div className="flex items-center ml-4">
          <span className="font-bold mr-1 text-lg">
            <CountUp
              end={amount ? Finance.toNumber(amount) : 0}
              duration={1.5}
              decimals={amount ? Finance.getDecimalsFromAmount(amount) : 0}
            />
          </span>
          <span className="text-xs font-bold">
            {Finance.getCurrencyName(currency)}
          </span>
        </div>
      </div>
      <div className="flex items-center font-bold md:font-normal">
        <span
          className="text-blue-400 text-sm mr-3 cursor-pointer p-1"
          onClick={() => props.onRecharge(currency)}
        >
          转入
        </span>
        <span
          className="text-blue-400 text-sm cursor-pointer p-1"
          onClick={() => props.onWithdraw(currency)}
        >
          转出
        </span>
      </div>
    </div>
  );
};

const Assets = observer(() => {
  const {
    accountStore,
    walletStore,
    snackbarStore,
    modalStore,
    confirmDialogStore,
  } = useStore();
  const { isEmpty, balance, loading } = walletStore;
  const history = useHistory();
  const state = useLocalStore(() => ({
    currency: '',
    openRechargeModal: false,
    openWithdrawModal: false,
  }));

  const onRecharge = (currency: string) => {
    if (Finance.getCurrencyName(currency).includes('-')) {
      history.replace(
        `/swap?tab=lp&type=in&currency_pair=${Finance.getCurrencyName(
          currency
        )}`
      );
      return;
    }
    state.currency = currency;
    modalStore.payment.show({
      title: '转入资产',
      currency: state.currency,
      pay: async (
        privateKey: string,
        accountName: string,
        amount: string,
        memo: string
      ) => {
        try {
          await PrsAtm.fetch({
            id: 'atm.cancelPaymentRequest',
            actions: ['atm', 'cancelPaymentRequest'],
            args: [privateKey, accountName],
          });
          await sleep(1000);
        } catch (err) {}
        const resp: any = await PrsAtm.fetch({
          id: 'atm.deposit',
          actions: ['atm', 'deposit'],
          args: [
            privateKey,
            accountName,
            null,
            amount,
            memo || Finance.defaultMemo.DEPOSIT,
          ],
        });
        return resp.paymentUrl;
      },
      checkResult: async (accountName: string, amount: string) => {
        const newBalance: any = await PrsAtm.fetch({
          id: 'getBalance',
          actions: ['account', 'getBalance'],
          args: [accountName],
        });
        const comparedAmount = add(
          bignumber(balance[state.currency] || 0),
          bignumber(amount)
        );
        const isDone = equal(
          bignumber(newBalance[state.currency] || 0),
          comparedAmount
        );
        if (isDone) {
          walletStore.setBalance(newBalance);
        }
        return isDone;
      },
      done: async () => {
        await sleep(800);
        1;
        snackbarStore.show({
          message: '资产转入成功',
        });
      },
    });
  };

  const onWithdraw = (currency: string) => {
    if (!accountStore.account.bound_mixin_profile) {
      snackbarStore.show({
        message: '请先绑定 Mixin 账号',
        type: 'error',
      });
      return;
    }
    if (Finance.getCurrencyName(currency).includes('-')) {
      history.replace(
        `/swap?tab=lp&type=out&currency_pair=${Finance.getCurrencyName(
          currency
        )}`
      );
      return;
    }
    if (Number(balance[currency]) === 0) {
      snackbarStore.show({
        message: '没有余额可提现哦',
        type: 'error',
      });
      return;
    }
    state.currency = currency;
    state.openWithdrawModal = true;
  };

  if (loading) {
    return (
      <div className="py-8">
        <Loading />
      </div>
    );
  }

  return (
    <div>
      {!isEmpty &&
        Object.keys(balance).map((currency: string) => {
          if (Finance.getCurrencyName(currency).includes('-')) {
            return null;
          }
          return (
            <div key={currency}>
              <Asset
                asset={[currency, balance[currency] || '']}
                onRecharge={onRecharge}
                onWithdraw={onWithdraw}
                hideBorder={true}
              />
            </div>
          );
        })}
      {isEmpty && (
        <div className="py-20 text-center text-gray-af text-14">空空如也 ~</div>
      )}
      <WithdrawModal
        currency={state.currency}
        open={state.openWithdrawModal}
        onClose={async (done?: boolean) => {
          state.openWithdrawModal = false;
          if (done) {
            await sleep(500);
            confirmDialogStore.show({
              content: `转出成功，可前往 Mixin 查看已到账的 ${state.currency}`,
              okText: '我知道了',
              ok: () => confirmDialogStore.hide(),
              cancelDisabled: true,
            });
          }
        }}
      />
    </div>
  );
});

interface IProps {
  minHeight: number;
}

export default observer((props: IProps) => {
  const { accountStore, walletStore } = useStore();

  React.useEffect(() => {
    (async () => {
      try {
        const balance: any = await PrsAtm.fetch({
          id: 'getBalance',
          actions: ['account', 'getBalance'],
          args: [accountStore.account.account_name],
        });
        walletStore.setBalance(balance);
      } catch (err) {}
    })();
  }, []);

  return (
    <div className="bg-white rounded-12 text-gray-6d">
      <div className="px-5 pt-4 pb-3 leading-none text-16 border-b border-gray-ec flex justify-between items-center">
        资产
      </div>
      <div
        className="px-5 py-2"
        style={{
          minHeight: props.minHeight,
        }}
      >
        <Assets />
      </div>
    </div>
  );
});
