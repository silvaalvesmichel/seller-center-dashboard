import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { FiCalendar, FiCheck, FiPaperclip, FiSearch, FiX } from 'react-icons/fi'

import { FormHandles } from '@unform/core'
import { format, isSameWeek, isToday, subDays } from 'date-fns'
import { Form } from '@unform/web'

import Button from '../../components/FilterButton'
import BulletedButton from '../../components/BulletedButton'
import FilterInput from '../../components/FilterInput'
import StatusPanel from '../../components/OrderStatusPanel'

import styles from './styles.module.scss'
import DatePickerPopup from '../../components/DatePickerPopup'
import Collapsible from '../../components/Collapsible'
import AttachController from '../../components/AttachController'
import { useLoading } from 'src/hooks/loading'
import { useAuth } from 'src/hooks/auth'
import api from 'src/services/api'
import AttachButton from 'src/components/AttachButton'
import Modal from 'src/components/Modal'
import NfeModalContent from 'src/components/NfeModalContent'
import { useModalMessage } from 'src/hooks/message'
import MessageModal from 'src/components/MessageModal'
import { Order, OrderParent, OrderStatusType } from 'src/shared/types/order'
import OrderDetailsModal from 'src/components/OrderDetailsModal'
import TrackingModalContent from 'src/components/TrackingModalContent'
import router from 'next/router'
import { OrderStatus } from 'src/shared/enums/order'
import { InOrderStatus, OrderContainsProduct } from 'src/shared/functions/sells'

enum SellStatus {
  // 'Pending' | 'Approved' | 'Invoiced' | 'Shipped' | 'Delivered' | 'Canceled' | 'Completed'
  Entregue = 'Entregue',
  Processando = 'Processando',
  Cancelado = 'Cancelado',
  Faturando = 'Aprovado',
  Despachado = 'Despachado',
  Despachando = 'Despachando',
  Todos = '?'
}

enum Filter {
  Hoje = 0,
  Semana = 1,
  Mes = 3,
  Custom = 4
}

type OrderProduct = {
  name: string,
  quantity: number,
  price: number,
  discount: number,
}


interface SearchFormData {
  search: string
}

interface SellsProps {
  sells: OrderParent[]
}

interface Totals {
  totalApproved: number
  totalProcessing: number
  totalCanceled: number
  total: number
}

export function Sells() {
  const [orders, setOrders] = useState([] as OrderParent[])
  const [items, setItems] = useState([] as OrderParent[])
  const [status, setStatus] = useState(SellStatus.Todos as SellStatus)
  const [orderStatus, setOrderStatus] = useState(OrderStatus.Todos as OrderStatus)

  const [fromDateFilter, setFromDateFilter] = useState(new Date())
  const [toDateFilter, setToDateFilter] = useState(new Date())

  const [filter, setFilter] = useState(Filter.Hoje)
  const [search, setSeacrh] = useState('')

  const itemsRef = useMemo(() => Array(items.length).fill(0).map(i => React.createRef<HTMLTableRowElement>()), [items])
  const collapsibleRefs = useMemo(() => items.length > 2 && Array(items.length).fill(0).map(i => React.createRef<HTMLDivElement>()), [items])

  const [totalApproved, setTotalApproved] = useState('Carregando...')
  const [totalProcessing, setTotalProcessing] = useState('Carregando...')
  const [totalCanceled, setTotalCanceled] = useState('Carregando...')
  const [total, setTotal] = useState('Carregando...')

  const { user, token, updateUser } = useAuth()
  const { isLoading, setLoading } = useLoading()
  const { showModalMessage: showMessage, modalMessage, handleModalMessage } = useModalMessage()

  const [isNfeModalOpen, setNfeModalOpen] = useState(false)
  const [nfeItem, setNfeItem] = useState<OrderParent>()

  const [isTrackingModalOpen, setTrackingModalOpen] = useState(false)
  const [trackingItem, setTrackingItem] = useState<OrderParent>()

  const [modalOrder, setModalOrder] = useState<Order>()
  const [isOrderModalOpen, setOrderModalOpen] = useState(false)

  useEffect(() => {
    setLoading(true)

    // setOrders(ordersFromApi)

    api.get('/account/detail').then(response => {
      updateUser({ ...user, shopInfo: { ...user.shopInfo, _id: response.data.shopInfo._id, userId: response.data.shopInfo.userId } })

      api.get('/order/all', {
        headers: {
          authorization: token,
          shop_id: response.data.shopInfo._id,
        }
      }).then(response => {
        // console.log('Orders:')
        // console.log(JSON.stringify(response.data))

        setOrders(response.data as OrderParent[])

        // response.data.map((order: OrderParent) => {

        // })

        setLoading(false)
      }).catch(err => {
        console.log(err)
        setLoading(false)
      })
    }).catch(err => {
      setLoading(false)

      console.log(err)
      router.push('/')
    })
  }, [])


  const inInterval = useCallback((order: Order) => {

    console.log(order.payment.purchaseDate)
    const date: Date = new Date(order.payment.purchaseDate)//parse(order.payment.purchaseDate, 'yyyy-MM-ddThh:mm:ss', new Date())

    console.log(date)

    switch (filter) {
      case Filter.Semana:
        return isSameWeek(date, new Date())

      case Filter.Mes:
        const today = new Date()

        return date >= subDays(today, 30) && date <= today

      case Filter.Custom:
        return format(date, 'yyyy/MM/dd') <= format(toDateFilter, 'yyyy/MM/dd') && format(date, 'yyyy/MM/dd') >= format(fromDateFilter, 'yyyy/MM/dd')

      default:
        return isToday(date)
    }
  }, [status, fromDateFilter, toDateFilter, filter])

  useEffect(() => {
    const totals = orders.reduce((accumulator: Totals, orderParent: OrderParent) => {
      const order = orderParent.order
      if (inInterval(order)) {
        switch (order.status.status) {
          case 'Completed':
          case 'Delivered':
          case 'Invoiced':
          case 'Shipped':
            accumulator.totalApproved += order.payment.totalAmountPlusShipping
            accumulator.total += order.payment.totalAmountPlusShipping
            break
          case 'Approved':
          case 'Pending':
            accumulator.totalProcessing += order.payment.totalAmountPlusShipping
            accumulator.total += order.payment.totalAmountPlusShipping
            break
          case 'Canceled':
            accumulator.totalCanceled += order.payment.totalAmountPlusShipping
            accumulator.total -= order.payment.totalAmountPlusShipping
            break
        }
      }

      return accumulator
    }, { totalApproved: 0, totalCanceled: 0, totalProcessing: 0, total: 0 })

    setTotalApproved(new Intl.NumberFormat('pt-BR', {
      style: 'currency',
      currency: 'BRL',
    }).format(totals.totalApproved))

    setTotalProcessing(new Intl.NumberFormat('pt-BR', {
      style: 'currency',
      currency: 'BRL',
    }).format(totals.totalProcessing))

    setTotalCanceled(new Intl.NumberFormat('pt-BR', {
      style: 'currency',
      currency: 'BRL',
    }).format(totals.totalCanceled))

    setTotal(new Intl.NumberFormat('pt-BR', {
      style: 'currency',
      currency: 'BRL',
    }).format(totals.total))
  }, [orders, orderStatus, fromDateFilter, toDateFilter, filter])

  const formRef = useRef<FormHandles>(null)
  const [error, setError] = useState('')

  useEffect(() => {
    const newItems = orders.filter((orderParent) => {
      const order = orderParent.order

      switch (status) {
        case SellStatus.Processando:
          return inInterval(order) && (order.status.status === 'Pending') && (search === '' || OrderContainsProduct(order, search))
        case SellStatus.Faturando:
          return inInterval(order) && (order.status.status === 'Approved') && (search === '' || OrderContainsProduct(order, search))
        case SellStatus.Despachando:
          return inInterval(order) && (order.status.status === 'Invoiced') && (search === '' || OrderContainsProduct(order, search))
        case SellStatus.Despachado:
          return inInterval(order) && (order.status.status === 'Shipped') && (search === '' || OrderContainsProduct(order, search))
        case SellStatus.Cancelado:
          return inInterval(order) && (order.status.status === 'Canceled') && (search === '' || OrderContainsProduct(order, search))
        case SellStatus.Entregue:
          return inInterval(order) && (order.status.status === 'Delivered' || order.status.status === 'Completed')
            && (search === '' || OrderContainsProduct(order, search))

        default:
          return inInterval(order) && InOrderStatus(order, orderStatus) && (search === '' || OrderContainsProduct(order, search))
      }
    })

    setItems(newItems)
  }, [orders, status, orderStatus, fromDateFilter, toDateFilter, search, filter])

  const handleSubmit = useCallback(
    async (data: SearchFormData) => {
      try {
        formRef.current?.setErrors({})

        if (data.search !== search) {
          setSeacrh(data.search)
        }

      } catch (err) {
        setError('Ocorreu um erro ao fazer login, cheque as credenciais.')
      }
    },
    [search],
  )

  const datePickerRef = useRef<FormHandles>(null)
  const [datePickerVisibility, setDatePickerVisibility] = useState(false)

  const handleModalVisibility = useCallback(() => {
    handleModalMessage(false)
  }, [])

  const handleOrderModalVisibility = useCallback(() => {
    setOrderModalOpen(false)
  }, [])

  const getOrderStatus = useCallback((orderStatus: OrderStatusType) => {
    switch (orderStatus) {
      case 'Pending':
        return SellStatus.Processando
      case 'Approved':
        return SellStatus.Faturando
      case 'Invoiced':
        return SellStatus.Despachando
      case 'Shipped':
        return SellStatus.Despachado
      case 'Canceled':
        return SellStatus.Cancelado
      case 'Delivered':
      case 'Completed':
        return SellStatus.Entregue
    }
  }, [])

  return (
    <div className={styles.sellsContainer}>
      <div className={styles.sellsHeader}>
        <BulletedButton
          onClick={() => setStatus(SellStatus.Todos)}
          isActive={status === SellStatus.Todos}>
          Todas
        </BulletedButton>
        <BulletedButton
          onClick={() => setStatus(SellStatus.Processando)}
          isActive={status === SellStatus.Processando}>
          Aguardando Pagamento
        </BulletedButton>
        <BulletedButton
          onClick={() => setStatus(SellStatus.Faturando)}
          isActive={status === SellStatus.Faturando}>
          Aguardando Faturamento
        </BulletedButton>
        <BulletedButton
          onClick={() => setStatus(SellStatus.Despachando)}
          isActive={status === SellStatus.Despachando}>
          Aguardando Despacho
        </BulletedButton>
        <BulletedButton
          onClick={() => setStatus(SellStatus.Despachado)}
          isActive={status === SellStatus.Despachado}>
          Despachados
        </BulletedButton>
        <BulletedButton
          onClick={() => setStatus(SellStatus.Entregue)}
          isActive={status === SellStatus.Entregue}>
          Entregues & Concluídos
        </BulletedButton>
        <BulletedButton
          onClick={() => setStatus(SellStatus.Cancelado)}
          isActive={status === SellStatus.Cancelado}>
          Cancelados
        </BulletedButton>
      </div>
      <div className={styles.divider} />
      <div className={styles.sellsContent}>
        <div className={styles.sellsOptions}>
          <div className={styles.contentFilters}>
            <Button isActive={filter === Filter.Hoje} onClick={() => setFilter(Filter.Hoje)}>
              Hoje
            </Button>
            <Button isActive={filter === Filter.Semana} onClick={() => setFilter(Filter.Semana)}>
              Esta semana
            </Button>
            <Button isActive={filter === Filter.Mes} onClick={() => setFilter(Filter.Mes)}>
              Este mês
            </Button>
            <div className={styles.verticalDivider} />
            <div>
              <Button
                icon={FiCalendar}
                isActive={filter === Filter.Custom}
                onClick={() => {
                  setFilter(Filter.Custom)
                  setDatePickerVisibility(!datePickerVisibility)
                }}>Escolher período</Button>

              {filter === Filter.Custom && (
                <DatePickerPopup
                  formRef={datePickerRef}
                  setToDateFilter={setToDateFilter}
                  setFromDateFilter={setFromDateFilter}
                  style={{
                    marginBottom: '-13.25rem'
                  }}
                  className={styles.datePopupContainer}
                  visibility={datePickerVisibility}
                  setVisibility={setDatePickerVisibility}
                />
              )}
            </div>
            <Form ref={formRef} onSubmit={handleSubmit} className={styles.searchContainer}>
              <FilterInput
                name="search"
                icon={FiSearch}
                placeholder="Pesquise um produto..."
                autoComplete="off" />
            </Form>
          </div>
        </div>
        {status === SellStatus.Todos && (
          <div className={styles.orderStatusButtons}>
            <StatusPanel title='Todos' onClick={() => setOrderStatus(OrderStatus.Todos)} isActive={orderStatus === OrderStatus.Todos}>
              <span className={styles.grayText}> {total} </span>
            </StatusPanel>
            <StatusPanel title='Aprovados' onClick={() => setOrderStatus(OrderStatus.Aprovado)} isActive={orderStatus === OrderStatus.Aprovado}>
              <span className={styles.greenText}> {totalApproved} </span>
            </StatusPanel>
            <StatusPanel title='Processando' onClick={() => setOrderStatus(OrderStatus.Processando)} isActive={orderStatus === OrderStatus.Processando}>
              <span className={styles.blueText}> {totalProcessing} </span>
            </StatusPanel>
            <StatusPanel title='Cancelados' onClick={() => setOrderStatus(OrderStatus.Cancelado)} isActive={orderStatus === OrderStatus.Cancelado}>
              <span className={styles.redText}> {totalCanceled} </span>
            </StatusPanel>
          </div>
        )}
        {items.length > 0 ? (
          <table className={styles.table}>
            <thead className={styles.tableHeader}>
              <tr>
                <th>Número do pedido</th>
                <th>Produtos</th>
                <th>Data</th>
                <th>Valor</th>
                <th>Status</th>
                <th>Ação</th>
              </tr>
            </thead>
            <tbody className={styles.tableBody}>
              {items.map((item, i) => (
                <tr className={styles.tableItem} key={item._id} ref={itemsRef[i]}>
                  <td width='12.5%'>
                    {item._id}
                  </td>
                  <td id={styles.itemsCell}>
                    {
                      item.order.products.map((product, i) => {
                        return (i < 2 && <p key={i}>{product.name}</p>)
                      })
                    }
                    {
                      item.order.products.length > 2 && (
                        <>
                          <Collapsible totalItems={item.order.products.length} toggleRef={!!collapsibleRefs ? collapsibleRefs[i] : undefined}>
                            {
                              item.order.products.map((product, i) => {
                                if (i < 2)
                                  return (<></>)

                                return (
                                  <p key={i}>{product.name}</p>
                                )
                              })
                            }
                          </Collapsible>
                        </>
                      )
                    }
                  </td>
                  <td id={styles.dateCell}>
                    {format(new Date(item.order.payment.purchaseDate), 'dd/MM/yyyy')}
                  </td>
                  <td id={styles.valueCell}>
                    {
                      new Intl.NumberFormat('pt-BR', {
                        style: 'currency',
                        currency: 'BRL',
                      }
                      ).format(item.order.payment.totalAmountPlusShipping)
                    }
                  </td>
                  <td width='12.5%'>
                    {getOrderStatus(item.order.status.status)}
                  </td>
                  <td id={status === SellStatus.Faturando || status === SellStatus.Despachando ? styles.attachmentCell : styles.actionCell}>
                    {status === SellStatus.Faturando ?
                      <AttachButton
                        name={item._id}
                        title='Anexo de NF-e'
                        attachedText='NF-e Anexada'
                        unattachedText='Anexar NF-e'
                        placeholder='Informe a URL da NF-e'
                        // isAttached={!!item.order.orderNotes && item.order.orderNotes.length > 0} //!item.nfe_url
                        isAttached={item.order.status.status === 'Invoiced'}
                        onClick={() => {
                          if (item.order.status.status === 'Approved') {
                            setNfeModalOpen(true)
                            setNfeItem(item)

                            return
                          }
                        }}
                      />
                      :
                      status === SellStatus.Despachando ?
                        <AttachButton
                          name={item._id}
                          title='Código de envio'
                          attachedText='Código de Envio'
                          unattachedText='Informar código'
                          placeholder='Informe o código de envio'
                          // handleAttachment={handleAttachment}
                          // isAttached={!!item.order.orderNotes} //!item.nfe_url
                          isAttached={item.order.status.status === 'Shipped'}
                          onClick={() => {
                            if (item.order.status.status === 'Invoiced') {
                              setTrackingModalOpen(true)
                              setTrackingItem(item)
                            }
                          }}
                        />
                        :
                        <span
                          className={styles.action}
                          onClick={() => {
                            setOrderModalOpen(true)
                            setModalOrder(item.order)
                          }}
                        > Ver detalhes </span>
                    }
                  </td>
                </tr>
              )
              )
              }
            </tbody>
          </table>
        ) : (
          <span className={styles.emptyList}> Nenhum item foi encontrado </span>
        )}
      </div>
      {
        (isNfeModalOpen && nfeItem) && (
          <Modal
            handleVisibility={() => { setNfeModalOpen(false) }}
            title='Anexar NF-e'
            icon={FiPaperclip}
          >
            <NfeModalContent item={nfeItem} closeModal={() => setNfeModalOpen(false)} />
          </Modal>
        )
      }
      {
        (isTrackingModalOpen && trackingItem) && (
          <Modal
            handleVisibility={() => { setTrackingModalOpen(false) }}
            title='Anexar Rastreio'
            icon={FiPaperclip}
          >
            <TrackingModalContent item={trackingItem} closeModal={() => setTrackingModalOpen(false)} />
          </Modal>
        )
      }
      {
        showMessage && (
          <MessageModal handleVisibility={handleModalVisibility}>
            <div className={styles.modalContent}>
              {modalMessage.type === 'success' ? <FiCheck style={{ color: 'var(--green-100)' }} /> : <FiX style={{ color: 'var(--red-100)' }} />}
              <p className={styles.title}>{modalMessage.title}</p>
              {modalMessage.message.map((message, i) => <p key={i} className={styles.messages}>{message}</p>)}
            </div>
          </MessageModal>
        )
      }
      {
        (isOrderModalOpen && modalOrder) && (
          <OrderDetailsModal handleVisibility={handleOrderModalVisibility} order={modalOrder} />
        )
      }
    </div >
  )
}

const ordersFromApi: OrderParent[] = JSON.parse(`[
  {
      "_id": "61ba3415cf833d0016816f19",
      "order": {
          "reference": {
              "idTenant": 3865,
              "store": "Lojas Americanas",
              "id": 804518824,
              "virtual": "Lojas Americanas-286264951601",
              "source": "286264951601",
              "system": {
                  "source": "b2wskyhub"
              }
          },
          "shipping": {
              "estimatedDeliveryDate": "2021-10-08T00:00:00",
              "responsible": "Marketplace",
              "provider": "B2W Entregas",
              "service": "B2W Entregas",
              "price": 9.97,
              "receiverName": "MARIA CLAUDIA GUIDELLI LANDINE DOS SANTOS",
              "address": {
                  "address": "Rua Aricanga",
                  "neighborhood": "Jardim Silva Teles",
                  "city": "São Paulo",
                  "state": "SP",
                  "zipCode": "08160000",
                  "additionalInfo": " ",
                  "number": "1234"
              }
          },
          "payment": {
              "method": "CREDIT_CARD",
              "paymentDate": "2021-09-30T12:40:55",
              "purchaseDate": "2021-09-30T12:40:55",
              "totalAmount": 104.9,
              "totalAmountPlusShipping": 114.87,
              "totalDiscount": 0,
              "installments": 3,
              "address": {
                  "address": "Rua Aricanga",
                  "neighborhood": "Jardim Silva Teles",
                  "city": "São Paulo",
                  "state": "SP",
                  "zipCode": "08160000",
                  "additionalInfo": " ",
                  "number": "1234"
              }
          },
          "status": {
              "status": "Completed",
              "updatedDate": "2021-10-06T07:20:17",
              "active": true,
              "message": ""
          },
          "customer": {
              "name": "MARIA CLAUDIA GUIDELLI LANDINE DOS SANTOS",
              "documentNumber": "12531401890",
              "telephone": "99 999999999",
              "mobileNumber": "99 999999999",
              "email": "12531401890@email.com.br"
          },
          "products": [
              {
                  "idProduct": 34662596,
                  "sku": "610afaee7947e9001549c7a7",
                  "name": "BLEND POMAR SANTO OFF (RELAXA E ACALMA) 10ml",
                  "quantity": 1,
                  "price": 50,
                  "discount": 0,
                  "type": "None"
              },
              {
                  "idProduct": 34662407,
                  "sku": "610af6507947e9001549c793",
                  "name": "ÓLEO ESSENCIAL DE LARANJA POMAR SANTO 5ml",
                  "quantity": 1,
                  "price": 20,
                  "discount": 0,
                  "type": "None"
              },
              {
                  "idProduct": 34662389,
                  "sku": "610af5bf7947e9001549c791",
                  "name": "ÓLEO ESSENCIAL DE CAPIM LIMÃO POMAR SANTO 5ml",
                  "quantity": 1,
                  "price": 34.9,
                  "discount": 0,
                  "type": "None"
              }
          ],
          "orderNotes": [],
          "orderAdditionalInfos": []
      },
      "shop_id": "60df95d99d34e9bd68fdcb8c"
  },
  {
      "_id": "61ba3415cf833d0016816f2a",
      "order": {
          "reference": {
              "idTenant": 3865,
              "store": "RaiaDrogasil",
              "id": 808571412,
              "source": "1176981204582-01",
              "system": {
                  "source": "raiadrogasil"
              }
          },
          "shipping": {
              "estimatedDeliveryDate": "2021-11-23T00:00:00",
              "responsible": "Seller",
              "provider": "Transportadora",
              "service": "Sedex",
              "price": 11.68,
              "receiverName": "RENATA DAVELLO FERRARA",
              "address": {
                  "address": "Avenida Montemagno",
                  "neighborhood": "Vila Formosa",
                  "city": "São Paulo",
                  "state": "SP",
                  "country": "BRA",
                  "zipCode": "03371000",
                  "additionalInfo": "apto 22c",
                  "number": "501"
              }
          },
          "payment": {
              "method": "promissory",
              "paymentDate": "2021-11-17T18:21:40",
              "purchaseDate": "2021-11-17T18:21:40",
              "approvedDate": "2021-11-17T06:22:14",
              "totalAmount": 49.9,
              "totalAmountPlusShipping": 61.58,
              "totalDiscount": 0,
              "installments": 1,
              "address": {
                  "address": "Avenida Montemagno",
                  "neighborhood": "Vila Formosa",
                  "city": "São Paulo",
                  "state": "SP",
                  "country": "BRA",
                  "zipCode": "03371000",
                  "additionalInfo": "apto 22c",
                  "number": "501"
              }
          },
          "status": {
              "status": "Shipped",
              "updatedDate": "2021-11-17T06:22:14",
              "active": true,
              "message": ""
          },
          "customer": {
              "name": "RENATA DAVELLO FERRARA",
              "documentNumber": "30599098813",
              "telephone": "+5511982682120",
              "email": "627738ebfe044f59bf0cb6337bf46b14@ct.vtex.com.br"
          },
          "products": [
              {
                  "idProduct": 37277389,
                  "sku": "60edf1f9a4d65f00159554b1",
                  "name": "ÓLEOS ESSENCIAIS PARA PRÉ TREINO (POMAR SANTO) 10 ml",
                  "quantity": 1,
                  "price": 49.9,
                  "shippingCost": 11.68,
                  "discount": 0,
                  "type": "None"
              }
          ],
          "orderNotes": [],
          "orderAdditionalInfos": []
      },
      "shop_id": "60df95d99d34e9bd68fdcb8c"
  },
  {
      "_id": "61bfaf6cd604990016433fd7",
      "order": {
          "reference": {
              "idTenant": 3865,
              "store": "RaiaDrogasil",
              "id": 803658888,
              "source": "1163302374940-01",
              "system": {
                  "source": "raiadrogasil"
              }
          },
          "shipping": {
              "estimatedDeliveryDate": "2021-09-28T00:00:00",
              "responsible": "Seller",
              "provider": "Correios",
              "service": "SEDEX",
              "price": 10.03,
              "receiverName": "Carla Zuleica dos Santos",
              "address": {
                  "address": "Rua Mariluz",
                  "neighborhood": "Engenheiro Goulart",
                  "city": "São Paulo",
                  "state": "SP",
                  "country": "BRA",
                  "zipCode": "03727010",
                  "additionalInfo": "",
                  "number": "79"
              }
          },
          "payment": {
              "method": "promissory",
              "paymentDate": "2021-09-21T17:40:51",
              "purchaseDate": "2021-09-21T17:40:51",
              "approvedDate": "2021-09-21T05:40:55",
              "totalAmount": 49.9,
              "totalAmountPlusShipping": 59.93,
              "totalDiscount": 0,
              "installments": 1,
              "address": {
                  "address": "Rua Mariluz",
                  "neighborhood": "Engenheiro Goulart",
                  "city": "São Paulo",
                  "state": "SP",
                  "country": "BRA",
                  "zipCode": "03727010",
                  "additionalInfo": "",
                  "number": "79"
              }
          },
          "status": {
              "status": "Approved",
              "updatedDate": "2021-09-21T05:40:55",
              "active": true,
              "message": ""
          },
          "customer": {
              "name": "Carla Zuleica dos Santos",
              "documentNumber": "30039461882",
              "telephone": "+5511953838604",
              "email": "fc8cc21df91147c4a5f0194a0e539e5e@ct.vtex.com.br"
          },
          "products": [
              {
                  "idProduct": 34660975,
                  "sku": "610aef467947e9001549c772",
                  "name": "BLEND POMAR SANTO BABY (RELAXA E ACALMA BEBÊS E CRIANÇAS) 10ml",
                  "quantity": 1,
                  "price": 49.9,
                  "shippingCost": 10.03,
                  "discount": 0,
                  "type": "None"
              }
          ],
          "orderNotes": [],
          "orderAdditionalInfos": []
      },
      "shop_id": "60df95d99d34e9bd68fdcb8c"
  },
  {
      "_id": "61ba3417cf833d0016816f51",
      "order": {
          "reference": {
              "idTenant": 3865,
              "store": "Lojas Americanas",
              "id": 803524641,
              "virtual": "Lojas Americanas-286013087401",
              "source": "286013087401",
              "system": {
                  "source": "b2wskyhub"
              }
          },
          "shipping": {
              "estimatedDeliveryDate": "2021-09-22T00:00:00",
              "responsible": "Marketplace",
              "provider": "B2W Entregas",
              "service": "B2W Entregas",
              "price": 0,
              "receiverName": "DUNIA MOUAWAD EL KHOURI",
              "address": {
                  "address": "Rua Armindo Guaraná",
                  "neighborhood": "Vila Regente Feijó",
                  "city": "São Paulo",
                  "state": "SP",
                  "zipCode": "03335070",
                  "additionalInfo": "apto 72 - Final rua Serra de Japi apto 72",
                  "reference": "Final rua Serra de Japi",
                  "number": "45"
              }
          },
          "payment": {
              "method": "CREDIT_CARD",
              "paymentDate": "2021-09-20T15:42:05",
              "purchaseDate": "2021-09-20T15:42:05",
              "approvedDate": "2021-09-20T15:46:04",
              "totalAmount": 89.9,
              "totalAmountPlusShipping": 89.9,
              "totalDiscount": 0,
              "installments": 1,
              "address": {
                  "address": "Rua Armindo Guaraná",
                  "neighborhood": "Vila Regente Feijó",
                  "city": "São Paulo",
                  "state": "SP",
                  "zipCode": "03335070",
                  "additionalInfo": "apto 72 - Final rua Serra de Japi apto 72",
                  "reference": "Final rua Serra de Japi",
                  "number": "45"
              }
          },
          "status": {
              "status": "Approved",
              "updatedDate": "2021-09-20T15:46:04",
              "active": true
          },
          "customer": {
              "name": "DUNIA MOUAWAD EL KHOURI",
              "documentNumber": "03718802899",
              "telephone": "99 999999999",
              "mobileNumber": "99 999999999",
              "email": "03718802899@email.com.br"
          },
          "products": [
              {
                  "idProduct": 34660805,
                  "sku": "610aec0e7947e9001549c76c",
                  "name": "HIDRATANTE CAPILAR AGUA DE COCO (LACES) 240ml",
                  "quantity": 1,
                  "price": 89.9,
                  "discount": 0,
                  "type": "None"
              }
          ],
          "orderNotes": [],
          "orderAdditionalInfos": []
      },
      "shop_id": "60df95d99d34e9bd68fdcb8c"
  },
  {
      "_id": "61ba341acf833d0016816fab",
      "order": {
          "reference": {
              "idTenant": 3865,
              "store": "MagazineLuiza",
              "id": 798509752,
              "virtual": "LU-1062070458284659",
              "source": "LU-1062070458284659",
              "system": {
                  "source": "magazineluiza"
              }
          },
          "shipping": {
              "estimatedDeliveryDate": "2021-08-25T00:00:00",
              "responsible": "Seller",
              "provider": "PAC",
              "service": "PAC",
              "price": 21,
              "receiverName": "Victoria Luz Alonso",
              "address": {
                  "address": "DEPUTADO LAERCIO CORTE",
                  "neighborhood": "PARAISO DO MORUMBI",
                  "city": "SAO PAULO",
                  "state": "SP",
                  "country": "BR",
                  "zipCode": "05706290",
                  "additionalInfo": "41b",
                  "number": "1455"
              }
          },
          "payment": {
              "method": "credit_card",
              "paymentDate": "0001-01-01T00:00:00",
              "purchaseDate": "2021-08-16T11:31:53",
              "approvedDate": "2021-08-16T02:55:55",
              "totalAmount": 89.9,
              "totalAmountPlusShipping": 110.9,
              "totalDiscount": 0,
              "installments": 2,
              "address": {
                  "address": "DEPUTADO LAERCIO CORTE",
                  "neighborhood": "PARAISO DO MORUMBI",
                  "city": "SAO PAULO",
                  "state": "SP",
                  "country": "BR",
                  "zipCode": "05706290",
                  "additionalInfo": "41b",
                  "number": "1455"
              }
          },
          "status": {
              "status": "Delivered",
              "updatedDate": "2021-09-16T09:56:43",
              "active": true,
              "message": ""
          },
          "customer": {
              "name": "Victoria Luz Alonso",
              "documentNumber": "42596863804",
              "telephone": "11984025352",
              "email": "LU-1062070458284659@alias.integracommerce.com.br"
          },
          "products": [
              {
                  "idProduct": 34850609,
                  "sku": "610aec0e7947e9001549c76c",
                  "name": "HIDRATANTE CAPILAR AGUA DE COCO (LACES) 240ml",
                  "quantity": 1,
                  "price": 89.9,
                  "shippingCost": 21,
                  "discount": 0,
                  "type": "None"
              }
          ],
          "orderNotes": [],
          "orderAdditionalInfos": []
      },
      "shop_id": "60df95d99d34e9bd68fdcb8c"
  },
  {
      "_id": "61ba341acf833d0016816fad",
      "order": {
          "reference": {
              "idTenant": 3865,
              "store": "Enjoei",
              "id": 798470447,
              "source": "bundle-44049235",
              "system": {
                  "source": "enjoei"
              }
          },
          "shipping": {
              "estimatedDeliveryDate": "2021-08-18T00:00:00",
              "responsible": "Seller",
              "provider": "Correios",
              "service": "SEDEX",
              "price": 9.71,
              "receiverName": "Andressa Martins",
              "address": {
                  "address": "Rua Expedicionário José Franco de Macedo",
                  "neighborhood": "Penha",
                  "city": "Bragança Paulista",
                  "state": "SP",
                  "country": "Brasil",
                  "zipCode": "12929-460",
                  "additionalInfo": "Alameda 1 casa 121",
                  "number": "574"
              }
          },
          "payment": {
              "method": "BS",
              "paymentDate": "2021-08-15T19:49:04",
              "purchaseDate": "2021-08-15T19:48:41",
              "totalAmount": 20,
              "totalAmountPlusShipping": 29.71,
              "totalDiscount": 0,
              "installments": 1,
              "address": {
                  "address": "Rua Expedicionário José Franco de Macedo",
                  "neighborhood": "Penha",
                  "city": "Bragança Paulista",
                  "state": "SP",
                  "country": "Brasil",
                  "zipCode": "12929-460",
                  "additionalInfo": "Alameda 1 casa 121",
                  "number": "574"
              }
          },
          "status": {
              "status": "Canceled",
              "updatedDate": "2021-08-15T19:49:11",
              "active": true
          },
          "customer": {
              "name": "Andressa Martins",
              "documentNumber": "22498948848",
              "telephone": "11932506090",
              "email": "andressalemos12@hotmail.com"
          },
          "canceledDate": "2021-10-16T11:05:43",
          "products": [
              {
                  "idProduct": 34662412,
                  "sku": "610af6507947e9001549c793",
                  "name": "ÓLEO ESSENCIAL DE LARANJA POMAR SANTO 5ml",
                  "quantity": 1,
                  "unity": "un",
                  "price": 20,
                  "shippingCost": 9.71,
                  "discount": 0,
                  "type": "None"
              }
          ],
          "orderNotes": [],
          "orderAdditionalInfos": []
      },
      "shop_id": "60df95d99d34e9bd68fdcb8c"
  },
  {
      "_id": "61ba341bcf833d0016816fbf",
      "order": {
          "reference": {
              "idTenant": 3865,
              "store": "RaiaDrogasil",
              "id": 807307462,
              "source": "1173892750212-01",
              "system": {
                  "source": "raiadrogasil"
              }
          },
          "shipping": {
              "estimatedDeliveryDate": "2021-11-10T00:00:00",
              "responsible": "Seller",
              "provider": "Transportadora",
              "service": "Sedex",
              "price": 11.68,
              "receiverName": "Odirlei nascimento da cruz",
              "address": {
                  "address": "Rua Guaqui",
                  "neighborhood": "Jardim Vale das Virtudes",
                  "city": "São Paulo",
                  "state": "SP",
                  "country": "BRA",
                  "zipCode": "05796040",
                  "additionalInfo": "casa 1",
                  "number": "434"
              }
          },
          "payment": {
              "method": "",
              "paymentDate": "2021-11-04T20:45:54",
              "purchaseDate": "2021-11-04T20:45:54",
              "totalAmount": 49.9,
              "totalAmountPlusShipping": 61.58,
              "totalDiscount": 0,
              "installments": 1,
              "address": {
                  "address": "Rua Guaqui",
                  "neighborhood": "Jardim Vale das Virtudes",
                  "city": "São Paulo",
                  "state": "SP",
                  "country": "BRA",
                  "zipCode": "05796040",
                  "additionalInfo": "casa 1",
                  "number": "434"
              }
          },
          "status": {
              "status": "Canceled",
              "updatedDate": "2021-11-09T11:39:11",
              "active": true,
              "message": ""
          },
          "customer": {
              "name": "Odirlei nascimento da cruz",
              "documentNumber": "28866820806",
              "telephone": "+5511987617421",
              "email": "f82dab262e60434a8bb7818b947c6b21@ct.vtex.com.br"
          },
          "canceledDate": "2021-11-09T08:39:11",
          "products": [
              {
                  "idProduct": 37277389,
                  "sku": "60edf1f9a4d65f00159554b1",
                  "name": "ÓLEOS ESSENCIAIS PARA PRÉ TREINO (POMAR SANTO) 10 ml",
                  "quantity": 1,
                  "price": 49.9,
                  "shippingCost": 11.68,
                  "discount": 0,
                  "type": "None"
              }
          ],
          "orderNotes": [],
          "orderAdditionalInfos": []
      },
      "shop_id": "60df95d99d34e9bd68fdcb8c"
  },
  {
      "_id": "61ba3421cf833d001681700a",
      "order": {
          "reference": {
              "idTenant": 3865,
              "store": "RaiaDrogasil",
              "id": 810654837,
              "source": "1181073549310-01",
              "system": {
                  "source": "raiadrogasil"
              }
          },
          "shipping": {
              "estimatedDeliveryDate": "2021-12-09T00:00:00",
              "responsible": "Seller",
              "provider": "Transportadora",
              "service": "Sedex",
              "price": 11.68,
              "receiverName": "Márcia Galves Castilho",
              "address": {
                  "address": "RUA FREI CANECA",
                  "neighborhood": "CONSOLAÇÃO",
                  "city": "São Paulo",
                  "state": "SP",
                  "country": "BRA",
                  "zipCode": "01307001",
                  "additionalInfo": "AP. 84",
                  "number": "617"
              }
          },
          "payment": {
              "method": "promissory",
              "paymentDate": "2021-12-07T08:32:26",
              "purchaseDate": "2021-12-07T08:32:26",
              "approvedDate": "2021-12-07T08:33:02",
              "totalAmount": 57,
              "totalAmountPlusShipping": 68.68,
              "totalDiscount": 0,
              "installments": 1,
              "address": {
                  "address": "RUA FREI CANECA",
                  "neighborhood": "CONSOLAÇÃO",
                  "city": "São Paulo",
                  "state": "SP",
                  "country": "BRA",
                  "zipCode": "01307001",
                  "additionalInfo": "AP. 84",
                  "number": "617"
              }
          },
          "status": {
              "status": "Approved",
              "updatedDate": "2021-12-07T08:33:02",
              "active": true,
              "message": ""
          },
          "customer": {
              "name": "Márcia Galves Castilho",
              "documentNumber": "06334659847",
              "telephone": "+551132311956",
              "email": "ec561ebc2d6b4e899918c1899f8792c6@ct.vtex.com.br"
          },
          "products": [
              {
                  "idProduct": 34662335,
                  "sku": "610af3707947e9001549c783",
                  "name": "ÓLEO ESSENCIAL DE LAVANDA (WNF) 10ml",
                  "quantity": 1,
                  "price": 57,
                  "shippingCost": 11.68,
                  "discount": 0,
                  "type": "None"
              }
          ],
          "orderNotes": [],
          "orderAdditionalInfos": []
      },
      "shop_id": "60df95d99d34e9bd68fdcb8c"
  }
]`)

// export const getStaticProps: GetStaticProps = async ({ }) => {
//   const sells = ordersFromApi //ordersFromApi.sort((a, b) => a.date < b.date ? -1 : 1)

//   return ({
//     props: { sells },
//     revalidate: 10
//   })
// }

export default Sells
