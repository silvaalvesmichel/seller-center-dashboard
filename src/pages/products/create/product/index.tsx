import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { useRouter } from 'next/router';

import { FormHandles } from '@unform/core';
import { Form } from '@unform/web';
import * as Yup from 'yup';

import Dropzone from '../../../../components/Dropzone';
import Button from '../../../../components/PrimaryButton';
import ImageCard from '../../../../components/ImageCard';
import Input from '../../../../components/Input';
import RadioButtonGroup from '../../../../components/RadioButtonGroup';
import VariationsController from '../../../../components/VariationsController';
import getValidationErrors from '../../../../utils/getValidationErrors';

import { FiCheck, FiChevronLeft, FiX } from 'react-icons/fi';

import styles from './styles.module.scss'

import api from 'src/services/api';
import { useAuth } from 'src/hooks/auth';
import { Product } from 'src/shared/types/product';
import TextArea from 'src/components/Textarea';
import { useLoading } from 'src/hooks/loading';
import { useModalMessage } from 'src/hooks/message';
import { Loader } from 'src/components/Loader';
import MessageModal from 'src/components/MessageModal';
import { AppError, findError, getErrorField } from 'src/shared/errors/api/errors';

type VariationDTO = {
  size?: number | string,
  stock?: number,
  color?: string,
}

export function ProductForm() {
  const [files, setFiles] = useState<File[]>([]);
  const [filesUrl, setFilesUrl] = useState<string[]>([]);

  const [filledFields, setFilledFields] = useState(0);
  const [totalFields, setTotalFields] = useState(14);

  const [variations, setVariations] = useState<VariationDTO[]>([{}]);

  const formRef = useRef<FormHandles>(null);

  const router = useRouter();

  const { user, token, updateUser } = useAuth();
  const { isLoading, setLoading } = useLoading();
  const { showModalMessage: showMessage, modalMessage, handleModalMessage } = useModalMessage();

  useEffect(() => {
    api.get('/account/detail').then(response => {
      updateUser({ ...user, shopInfo: { ...user.shopInfo, _id: response.data.shopInfo._id } })
    }).catch(err => {
      console.log(err)
    });
  }, [])

  const handleOnFileUpload = useCallback((file: string[]) => {
    calcFilledFields(formRef.current?.getData() as Product);
  }, [filesUrl]);

  const handleDeleteFile = useCallback((file: string) => {
    URL.revokeObjectURL(file);

    const filesUpdate = filesUrl.filter(f => f !== file);

    formRef.current?.setFieldValue('images', filesUpdate);
    setFilesUrl(filesUpdate);

    calcFilledFields(formRef.current?.getData() as Product);
  }, [filesUrl])

  useEffect(() => {
    if (variations.length > 0) {
      setTotalFields(10 + variations.length * 3)
      return;
    }

    setTotalFields(13)
  }, [variations])

  const calcFilledFields = useCallback((data: Product) => {
    let filled = 0;

    if (data.name)
      filled++;
    if (data.brand)
      filled++;
    if (data.description)
      filled++;
    if (data.sku)
      filled++;
    if (data.height)
      filled++;
    if (data.width)
      filled++;
    if (data.length)
      filled++;
    if (data.weight)
      filled++;
    if (data.price)
      filled++;
    if (data.images?.length > 0)
      filled++;

    data.variations.forEach(variation => {
      !!variation.size && filled++;
      !!variation.stock && filled++;
      !!variation.color && filled++;
    })

    setFilledFields(filled);
  }, [filesUrl, filledFields, totalFields])

  const handleModalVisibility = useCallback(() => {
    handleModalMessage(false);
  }, [])

  const handleSubmit = useCallback(async (data) => {
    if (filledFields < totalFields) {
      handleModalMessage(true, { type: 'error', title: 'Formulário incompleto', message: ['Preencha todas as informações obrigatórias antes de continuar.'] })
      return;
    }

    if (data.price_discounted === "") {
      data.price_discounted = data.price;
    }

    try {
      setLoading(true)
      formRef.current?.setErrors({});

      const schema = Yup.object().shape({
        images: Yup.array().min(1, 'Escolha pelo menos \numa imagem'),
        name: Yup.string().required('Campo obrigatório'),
        description: Yup.string()
          .required('Campo obrigatório'),
        brand: Yup.string().required('Campo obrigatório'),
        ean: Yup.string(),
        sku: Yup.string().required('Campo obrigatório'),
        height: Yup.number().min(10, 'Mínimo de 10cm'),
        width: Yup.number().min(10, 'Mínimo de 10cm'),
        length: Yup.number().min(10, 'Mínimo de 10cm'),
        weight: Yup.number().required('Campo obrigatório'),
        gender: Yup.string(),
        price: Yup.number().required('Campo obrigatório'),
        price_discounted: Yup.number().nullable().min(0, 'Valor mínimo de R$ 0').max(data.price, `Valor máximo de R$ ${data.price}`),
        variations: Yup.array().required().of(Yup.object().shape({
          // type: Yup.string().equals(['number', 'size']),
          // size: Yup.mixed().when('type', {
          //   is: (val: 'number' | 'size') => val === 'number',
          //   then: Yup.number().required('Campo obrigatório'),
          //   otherwise: Yup.string().required('Campo obrigatório'),
          // }),
          size: Yup.string().required('Campo obrigatório'),
          color: Yup.string().required('Campo obrigatório'),
          stock: Yup.number().typeError('Campo obrigatório').required('Campo obrigatório').min(0, 'Valor mínimo 0'),
        })),
      });

      await schema.validate(data, { abortEarly: false });

      const {
        category,
        subCategory,
        nationality
      } = router.query;

      var dataContainer = new FormData();

      files.forEach(file => {
        dataContainer.append("images", file, file.name)
      });

      const imagesUrls = await api.post('/product/upload', dataContainer, {
        headers: {
          authorization: token,
          shop_id: user.shopInfo._id,
        }
      }).then(response => {
        return response.data.urls
      });

      const {
        name,
        description,
        brand,
        ean,
        sku,
        gender,
        height,
        width,
        length,
        weight,
        price,
        price_discounted,
        variations
      } = data;

      // let formatedValidations = variations as Omit<VariationDTO, '_id'>[];
      variations.map((vars: any) => {
        delete vars._id;
      })

      console.log(variations)

      const product = {
        category,
        subcategory: subCategory,
        nationality,
        name,
        description,
        brand,
        ean,
        sku,
        gender,
        height,
        width,
        length,
        weight,
        price,
        price_discounted,
        images: imagesUrls,
        variations
      }

      console.log(product)

      //TODO: chamada para a API
      const response = await api.post('/product', product, {
        headers: {
          authorization: token,
          shop_id: user.shopInfo._id,
        }
      }).then(response => {
        console.log(response.data)
        setLoading(false)

        router.push('/products');
      }).catch(err => {
        console.log(err.response.data);

        handleModalMessage(true, { title: 'Erro', message: ['Ocorreu um erro inesperado'], type: 'error' })
      });

      setLoading(false)

      // addToast({
      //   type: 'success',
      //   title: 'Perfil atualizado!',
      //   description:
      //     'Suas informações do perfil foram alteradas com sucesso!',
      // });
    } catch (err) {
      setLoading(false)
      console.log(err)
      if (err instanceof Yup.ValidationError) {
        const errors = getValidationErrors(err);
        formRef.current?.setErrors(errors);

        return;
      }
    }
  }, [router, token, user, filledFields, totalFields])

  const variationsController = useMemo(() => {
    return variations
  }, [variations])

  function handleDeleteVariation(deletedIndex: number) {
    setVariations(formRef.current?.getData().variations)

    const tempVars = variations.filter((vars, i) => i !== deletedIndex);

    setVariations(tempVars)
  }

  const handleAddVariation = useCallback(() => {
    setVariations([...variations, {}])
  }, [variations]);

  return (
    <>
      <div className={styles.container}>
        <section className={styles.header}>
          <Button
            customStyle={{ className: styles.backButton }}
            onClick={() => router.back()}
            icon={FiChevronLeft}
          >
            Voltar
          </Button>
        </section>
        <div className={styles.divider} />
        <section className={styles.content}>
          <Form ref={formRef} onSubmit={handleSubmit} onChange={(e) => {
            calcFilledFields(formRef.current?.getData() as Product);
            // const formData = formRef.current?.getData() as Product;
            // setVariations(formData.variations);
          }}>
            <p className={styles.imagesTitle}>Seleciones as fotos do produto</p>
            <div className={styles.imagesContainer}>
              <Dropzone
                name='images'
                filesUrl={filesUrl}
                setFilesUrl={setFilesUrl}
                onFileUploaded={(files) => handleOnFileUpload(files)}
                files={files}
                setFiles={setFiles}
              />
              {
                filesUrl.map((file, i) => (
                  <ImageCard key={i} onClick={() => handleDeleteFile(file)} imgUrl={file} />
                ))
              }
            </div>
            <div className={styles.doubleInputContainer}>
              <Input
                name='name'
                label='Nome do produto'
                placeholder='Insira o nome do produto'
                autoComplete='off'
              />
              <Input
                name='brand'
                label='Marca'
                placeholder='Insira a marca'
                autoComplete='off'
              />

            </div>

            <div className={styles.singleInputContainer}>
              <TextArea
                name='description'
                label='Descrição do produto'
                placeholder='Insira a descrição do produto'
                autoComplete='off'
              />
            </div>

            <div className={styles.titledContainer}>
              <p className={styles.title}>Selecione o gênero</p>
              <RadioButtonGroup
                name='gender'
                defaultRadio='M'
                radios={[
                  { name: 'masculino', value: 'M', label: 'Masculino' },
                  { name: 'feminino', value: 'F', label: 'Feminino' },
                  { name: 'unissex', value: 'U', label: 'Unissex' }]}
              />
            </div>
            <div className={styles.multipleInputContainer}>
              <Input
                name='ean'
                label='EAN'
                placeholder='EAN do produto (opcional)'
                autoComplete='off'
              />
              <Input
                name='sku'
                label='SKU'
                placeholder='SKU do produto'
                autoComplete='off'
              // disabled //TODO: gerar automagico o SKU
              />
              <Input
                name='price'
                label='Preço (R$)'
                placeholder='Preço'
                autoComplete='off'
                type='number'
                min={0}
              />
              <Input
                name='price_discounted'
                label='Preço com desconto (R$)'
                placeholder='Preço com desconto (opcional)'
                autoComplete='off'
                type='number'
                min={0}
              />
            </div>
            <div className={styles.multipleInputContainer}>
              <Input
                name='height'
                label='Alturam (cm)'
                placeholder='Altura da embalagem'
                autoComplete='off'
                type='number'
              />
              <Input
                name='width'
                label='Largura (cm)'
                placeholder='Largura da embalagem'
                autoComplete='off'
                type='number'
              />
              <Input
                name='length'
                label='Comprimento (cm)'
                placeholder='Comprimento da embalagem'
                autoComplete='off'
                type='number'
              />
              <Input
                name='weight'
                label='Peso (g)'
                placeholder='Peso total'
                autoComplete='off'
              />
            </div>
            <div className={styles.variationsContainer}>
              <div className={styles.variationsContainerTitle}>
                <div className={styles.variationsTitle}>
                  <h3>Informações das variações do produto</h3>
                  <span>Preencha <b>todos</b> os campos</span>
                </div>
              </div>
              <VariationsController name='variations' variations={variationsController} handleAddVariation={handleAddVariation} handleDeleteVariation={handleDeleteVariation} />
            </div>
          </Form>
        </section>
      </div>

      <div className={styles.footerContainer}>
        <span>{filledFields}/{totalFields} Informações inseridas</span>
        {filledFields >= totalFields && <Button type='submit' onClick={() => { formRef.current?.submitForm() }}>Cadastrar produto</Button>}
      </div>

      {
        isLoading && (
          <div className={styles.loadingContainer}>
            <Loader />
          </div>
        )
      }
      {
        showMessage && (
          <MessageModal handleVisibility={handleModalVisibility}>
            <div className={styles.modalContent}>
              {modalMessage.type === 'success' ? <FiCheck style={{ color: 'var(--green-100)' }} /> : <FiX style={{ color: 'var(--red-100)' }} />}
              <p>{modalMessage.title}</p>
              <p>{modalMessage.message}</p>
            </div>
          </MessageModal>
        )
      }
    </>
  );
}

export default ProductForm;
