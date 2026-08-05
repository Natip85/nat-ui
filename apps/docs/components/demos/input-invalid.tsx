import {Input} from '@nat-ui/registry/components/ui/input'

/**
 * The attribute is set by hand here to show the styling on its own. In an
 * application Base UI sets it for you when the input sits inside a `Field.Root`
 * that has failed validation.
 */
export function InputInvalid() {
  return <Input placeholder='Email' data-invalid='' className='max-w-xs' />
}
